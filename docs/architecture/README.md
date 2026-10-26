# Architecture

ServiceOPS is split into four boundaries:

1. `src/domain`: typed entities, deterministic seed generation, calculations, and atomic commands.
2. `src/app`: Next.js route shell and metadata.
3. `src/components`: stateful application UI backed only by domain commands.
4. Browser persistence: a schema-versioned synthetic session snapshot with reset-to-baseline behavior.

The demo has no backend trust boundary. All records are fictional, all calculations are reproducible, and all externally consequential actions remain out of scope.
