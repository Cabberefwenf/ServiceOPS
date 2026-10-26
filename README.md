# ServiceOPS

ServiceOPS is a local-first field-service intelligence, dispatch, and operational-control demonstration for the fictional **Northstar Industrial Service Group**. It demonstrates real state transitions, technician constraints, parts reservation, SLA risk, service economics, audit history, and reversible operational scenarios—without accounts, a database, or paid APIs.

> All people, companies, sites, assets, jobs, and financial records in the application are synthetic.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Run `npm run verify` for lint, type checking, unit tests, and the production build; run `npm run test:e2e` for browser flows.

## Architecture and status

- [Architecture decision](docs/architecture/ADR-001-platform.md)
- [Product requirements](docs/product/requirements.md)
- [Testing strategy](docs/testing.md)
- [Deployment guide](docs/deployment.md)

The initial release is a portfolio-grade vertical slice, not a claim of production enterprise readiness or real customer adoption. No license has been added because the owner has not selected one.
