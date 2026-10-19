# Deploy

## Site

A push or merge to `master` runs the GitHub Pages workflow. It builds the production configuration with base href `/` and publishes that folder. The public site name is set in that workflow.

A pull request, or a branch that is not `master`, does not deploy. Stacking a feature branch onto another feature branch also does not deploy. Only `master` does.

The production environment file is what that build uses. Flags documented in `docs/FLAGS.md` have to be right on `master` before the workflow runs.

## Archive API

The API is not deployed by the site workflow. A release is a folder named for the commit. The start script in that folder holds the environment variable names. An admin restarts the process onto the new folder. The previous folder stays in place.

Rollback is a script that points the process back at the previous release folder and restarts. Do not delete the previous folder until the new process has been checked.

Restart the API on purpose. A site deploy does not restart it. Two copies on the same port will fail; stop the old process before the new one listens.
