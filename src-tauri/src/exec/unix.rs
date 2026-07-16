use std::time::Duration;

use log::{error, info};
use tauri::{AppHandle, Emitter as _};
use tokio::{sync::oneshot, time};

use crate::error::{Error, Result};

pub type GameLaunchRes = tokio::process::Child;

pub async fn launch_game(
    game_id: u32,
    app: AppHandle,
    game_start_sender: oneshot::Sender<()>,
    start_ctx: super::StartCtx,
) -> Result<GameLaunchRes> {
    let child = start_ctx.build_async_command()?.spawn()?;

    app.emit(&format!("game://spawn/{}", game_id), ())?;
    game_start_sender
        .send(())
        .map_err(|_| Error::InvalidChannel("game_start_sender"))?;

    Ok(child)
}

pub async fn game_loop(
    mut child: GameLaunchRes,
    game_id: u32,
    app: AppHandle,
    game_exit_sender: oneshot::Sender<()>,
) -> Result<()> {
    let mut interval = time::interval(Duration::from_secs(60));
    let mut last_time_saved = chrono::Utc::now();
    let mut total_session = chrono::TimeDelta::milliseconds(0);
    // The first tick fires immediately, so skip it.
    interval.tick().await;

    loop {
        tokio::select! {
            // Branch A: process exited
            status = child.wait() => {
                let chunk = chrono::Utc::now() - last_time_saved;
                total_session += chunk;
                super::record_daily(game_id, total_session);
                let payload = super::GameExitPayload {
                    success: status.is_ok(),
                    session_secs: total_session.num_seconds() as u64,
                };
                app.emit(&format!("game://exit/{}", game_id), &payload)?;
                match status {
                    Ok(s) => info!("Game exited with status: {}", s),
                    Err(e) => error!("Error waiting for game process: {}", e),
                }
                super::update_game_time(&app, game_id, chunk)?;
                game_exit_sender
                    .send(())
                    .map_err(|_| Error::InvalidChannel("game_exit_sender"))?;
                break Ok(());
            }
            // Branch B: timer tick (every 60s)
            _ = interval.tick() => {
                let chunk = chrono::Utc::now() - last_time_saved;
                total_session += chunk;
                super::update_game_time(&app, game_id, chunk)?;
                last_time_saved = chrono::Utc::now();
            }
        }
    }
}
