use std::{
  net::{SocketAddr, TcpStream},
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::Duration,
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const OVERSEE_PORT: u16 = 4173;
const OVERSEE_URL: &str = "http://127.0.0.1:4173";

struct ServerProcess(Mutex<Option<Child>>);

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      start_oversee_server(app)?;

      WebviewWindowBuilder::new(app, "main", WebviewUrl::External(OVERSEE_URL.parse()?))
        .title("Oversee")
        .inner_size(1440.0, 960.0)
        .min_inner_size(1100.0, 760.0)
        .resizable(true)
        .build()?;

      Ok(())
    })
    .on_window_event(|window, event| {
      if matches!(event, WindowEvent::Destroyed) {
        if let Some(server) = window.app_handle().try_state::<ServerProcess>() {
          if let Ok(mut child) = server.0.lock() {
            if let Some(mut process) = child.take() {
              let _ = process.kill();
            }
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running Oversee");
}

fn start_oversee_server(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  app.manage(ServerProcess(Mutex::new(None)));

  if server_is_running() {
    return Ok(());
  }

  let root = app_root(app);
  let server_js = root.join("server.js");
  let node = node_runtime_path(app).unwrap_or_else(|| PathBuf::from("node"));
  let child = Command::new(node)
    .arg(server_js)
    .current_dir(root)
    .env("PORT", OVERSEE_PORT.to_string())
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()?;

  if let Some(server) = app.try_state::<ServerProcess>() {
    if let Ok(mut process) = server.0.lock() {
      *process = Some(child);
    }
  }

  wait_for_server();
  Ok(())
}

fn app_root(app: &tauri::App) -> PathBuf {
  if cfg!(debug_assertions) {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .parent()
      .expect("project root")
      .to_path_buf()
  } else {
    app
      .path()
      .resource_dir()
      .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
  }
}

fn node_runtime_path(app: &tauri::App) -> Option<PathBuf> {
  let resource_dir = app.path().resource_dir().ok()?;
  let candidates = [
    resource_dir.join("node.exe"),
    resource_dir.join("resources").join("node.exe"),
  ];

  candidates.into_iter().find(|path| path.exists())
}

fn server_is_running() -> bool {
  let address = SocketAddr::from(([127, 0, 0, 1], OVERSEE_PORT));
  TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

fn wait_for_server() {
  for _ in 0..24 {
    if server_is_running() {
      return;
    }
    thread::sleep(Duration::from_millis(125));
  }
}
