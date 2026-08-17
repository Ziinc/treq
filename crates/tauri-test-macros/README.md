# tauri-test-macros

Implementation crate for `tauri-test`.

Most users should depend on `tauri-test` instead of using this crate directly.

This workspace vendors 0.2.1 with two local fixes:

- Type-ascribe each generated `invoke` arm so rustc can infer `Result<Value, String>` across many commands.
- Deserialize `Option<T>` / other JSON args with `from_value`, and strip a leading `_` before camelCasing invoke keys (`_request_id` → `requestId`).

