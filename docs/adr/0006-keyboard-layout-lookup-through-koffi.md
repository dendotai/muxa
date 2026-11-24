# 0006. The confirmation prompt reads the macOS keyboard layout through koffi

**Status:** Accepted

## Context

`confirmPrompt` answers to one key. On a non-Latin keyboard layout the Y key types another letter (`н` on Russian), and a terminal sends only that character, never which key was pressed. A table of letters written by hand covers one language and is easy to get wrong: muxa's own table mapped `у` to yes and `н` to no, so the Y key on Russian answered no. macOS can say which Latin letter sits on each key, but only through C functions (`TISCopyCurrentKeyboardLayoutInputSource`, `UCKeyTranslate`) that Node cannot call without a native module.

## Decision

On macOS, the prompt maps a typed character to the Latin letter of the same key, read from the OS layouts through `koffi`, a foreign function interface with prebuilt binaries. `koffi` is a runtime dependency, kept out of the bundle (`--external koffi`) and loaded with `import()` only when the prompt shows. The lookup starts when the prompt is printed.

Elsewhere (Linux, WSL, Git Bash), and when the lookup fails, the prompt reads a typed `y` or `n` only, and the first non-Latin letter prints `Press y or n (switch to a Latin layout)`.

## Consequences

- **Positive:** on macOS the Y and N keys answer on every layout, with no table to keep.
- **Accepted trade-off:** a second runtime dependency of about 3 MB with its platform package, downloaded on every platform and loaded only on macOS. `koffi`'s `install` script is not needed: Bun blocks it, and the lookup still works under Bun and Node.
- **Accepted trade-off:** the first prompt on a Mac can wait about half a second to a second for the cold load of `koffi`; the user's reading time usually hides it.
- **Open:** a lookup on Windows under Git Bash (`GetKeyboardLayout`, `ToUnicodeEx`), once someone needs it.

## Rejected

- A Latin `y` or `n` only, with the hint, on every platform: on macOS the layout can be read, so the user should not have to switch layouts.
- A corrected Russian table (`н` for yes, `т` for no): it covers one language.
- `osascript -l JavaScript` with no new dependency: its bridge rejects the pointer arguments of `UCKeyTranslate`.
- `native-keymap`: it ships C++ source and compiles on every install.
