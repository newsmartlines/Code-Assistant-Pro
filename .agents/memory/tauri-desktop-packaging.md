---
name: Tauri desktop packaging
description: Durable packaging constraints for the MyCode AI Tauri shell.
---

Tauri context generation requires a valid icon asset and can fail before Rust compilation if the configured icon path is missing. Keep the standard generated PNG, ICO, and ICNS variants under the Tauri icons directory and list the platform-appropriate assets in the bundle configuration.

**Why:** A missing icon blocked `cargo check` and made the desktop shell look like it had a code failure even though the Rust commands were valid.

**How to apply:** After changing Tauri packaging configuration, run the icon generator, `cargo fmt --check`, `cargo check`, and the desktop frontend build. Generate NSIS/MSI on a Windows host because Linux cannot validate the Windows installer toolchain.