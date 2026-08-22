use std::{
  fs::{File, OpenOptions},
  net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::Duration,
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

struct ServerProcess(Mutex<Option<Child>>);

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let oversee_url = start_oversee_server(app)?;

      WebviewWindowBuilder::new(app, "main", WebviewUrl::External(oversee_url.parse()?))
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

fn start_oversee_server(app: &tauri::App) -> Result<String, Box<dyn std::error::Error>> {
  app.manage(ServerProcess(Mutex::new(None)));
  let port = reserve_local_port()?;

  let root = app_root(app);
  let node = node_runtime_path(app).unwrap_or_else(|| PathBuf::from("node"));
  let (stdout_log, stderr_log) = server_log_files(app);
  let mut command = Command::new(node);
  command
    .arg("server.js")
    .current_dir(&root)
    .env("PORT", port.to_string())
    .stdin(Stdio::null())
    .stdout(stdout_log.map(Stdio::from).unwrap_or_else(|_| Stdio::null()))
    .stderr(stderr_log.map(Stdio::from).unwrap_or_else(|_| Stdio::null()));

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  let child = command.spawn()?;

  if let Some(server) = app.try_state::<ServerProcess>() {
    if let Ok(mut process) = server.0.lock() {
      *process = Some(child);
    }
  }

  wait_for_server(port)?;
  Ok(format!("http://127.0.0.1:{port}"))
}

fn app_root(app: &tauri::App) -> PathBuf {
  if cfg!(debug_assertions) {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .parent()
      .expect("project root")
      .to_path_buf()
  } else {
    let resource_dir = app.path().resource_dir().unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    let exe_dir = std::env::current_exe()
      .ok()
      .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
      .unwrap_or_default();
    let candidates = [
      resource_dir.clone(),
      resource_dir.join("_up_"),
      resource_dir.join("resources"),
      exe_dir.clone(),
      exe_dir.join("_up_"),
      exe_dir.join("resources"),
    ];

    candidates
      .into_iter()
      .find(|path| path.join("server.js").exists())
      .unwrap_or(resource_dir)
  }
}

fn node_runtime_path(app: &tauri::App) -> Option<PathBuf> {
  let resource_dir = app.path().resource_dir().ok()?;
  let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
  let candidates = [
    resource_dir.join("node.exe"),
    resource_dir.join("node"),
    resource_dir.join("resources").join("node.exe"),
    resource_dir.join("resources").join("node"),
    resource_dir.join("_up_").join("resources").join("node.exe"),
    resource_dir.join("_up_").join("resources").join("node"),
    exe_dir.join("node.exe"),
    exe_dir.join("node"),
    exe_dir.join("resources").join("node.exe"),
    exe_dir.join("resources").join("node"),
    exe_dir.join("_up_").join("resources").join("node.exe"),
    exe_dir.join("_up_").join("resources").join("node"),
  ];

  candidates.into_iter().find(|path| path.exists())
}

fn server_log_files(app: &tauri::App) -> (std::io::Result<File>, std::io::Result<File>) {
  let log_dir = app
    .path()
    .app_log_dir()
    .unwrap_or_else(|_| std::env::temp_dir().join("Oversee"));
  let _ = std::fs::create_dir_all(&log_dir);
  (
    open_log_file(log_dir.join("oversee-server.out.log")),
    open_log_file(log_dir.join("oversee-server.err.log")),
  )
}

fn open_log_file(path: PathBuf) -> std::io::Result<File> {
  OpenOptions::new().create(true).append(true).open(path)
}

fn reserve_local_port() -> Result<u16, Box<dyn std::error::Error>> {
  let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))?;
  let port = listener.local_addr()?.port();
  drop(listener);
  Ok(port)
}

fn server_is_running(port: u16) -> bool {
  let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
  TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

fn wait_for_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
  for _ in 0..120 {
    if server_is_running(port) {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(125));
  }
  Err(format!("Oversee local server did not start on port {port}").into())
}
