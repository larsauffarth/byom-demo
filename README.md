# BYOM Demo: Automated Page Publish with App Builder + Edge Delivery

This repository demonstrates an end-to-end BYOM setup that previews and publishes overlay pages via Adobe App Builder actions and the AEM Edge Delivery Services Admin API. It includes two actions (`webhook`, `data-provider`), demo blocks (`user-profile`, `user-overview`), and site/index configuration using the Configuration Service.

## BYOM Actions demo (Webhook → Publish)

This repository also includes a public demo of Adobe App Builder actions that trigger an automated page publish:

- See `app-builder/byom-actions/README.md` for an overview of the two actions:
  - `webhook`: orchestrates preview → publish via the Helix Admin API.
  - `data-provider`: returns HTML (`user-profile.html`) for overlay paths under `/byom-page/*`.
  - The demo includes Edge Delivery configuration under `config/site-config.json` and an index definition in `config/index-config.yaml`. 
    - Enable the Configuration Service and apply these via the Admin API; see the linked docs in `app-builder/byom-actions/README.md`.

## Project overview

- `blocks/`
  - Added demo blocks:
    - `user-profile/`: Renders a detailed user profile page.
    - `user-overview/`: Renders a table/overview of users.
- `app-builder/`
  - `byom-actions/`: Contains two actions used in the demo:
    - `actions/webhook/`: Triggers preview → publish on the Helix Admin API.
    - `actions/data-provider/`: Generates HTML for `/byom-page/*` using `templates/user-profile.html`.
  - See `app-builder/byom-actions/README.md` for full details and example commands.
- `config/`
  - `site-config.json`: Edge Delivery site configuration (including overlay to the data provider).
  - `index-config.yaml`: Index definition for `/byom-page/**` to `/user-index.json`.

## DA compatible

This specific repo has been _slightly_ modified to be compatible with DA's live preview.

## Getting started

### 1. Github
1. Use this template to make a new repo.
1. Install [AEM Code Sync](https://github.com/apps/aem-code-sync).

### 2. DA content
1. Browse to https://da.live/start.
2. Follow the steps.

### 3. Enable the Configuration Service
- Follow the guide to enable and manage site configuration for Edge Delivery Services.
- Reference: Setting up the configuration service (`https://www.aem.live/docs/config-service-setup.md`)

### 4. App Builder actions
- See `app-builder/byom-actions/README.md` for deploying and invoking the actions (`webhook`, `data-provider`).

### 5. Apply the Site Configuration (Admin API)
Use the Admin API to apply `config/site-config.json`:

```bash
curl -X PUT "https://admin.hlx.page/config/<org>/sites/<site>.json" \
  -H "content-type: application/json" \
  -H "x-auth-token: {your-auth-token}" \
  --data @config/site-config.json
```

### 6. Create/Update the Index Configuration (Admin API)
Use the Admin API to apply `config/index-config.yaml`:

```bash
curl -X POST "https://admin.hlx.page/config/<org>/sites/<site>/content/query.yaml" \
  -H "content-type: text/yaml" \
  -H "x-auth-token: {your-auth-token}" \
  --data-binary @config/index-config.yaml
```

- References:
  - Indexing: `https://www.aem.live/developer/indexing.md`
  - Admin API (index config): `https://www.aem.live/docs/admin.html#tag/indexConfig/operation/createIndexConfig`

### 7. Local development
1. Clone your new repo to your computer.
1. Install the AEM CLI using your terminal: `sudo npm install -g @adobe/aem-cli`
1. Start the AEM CLI: `aem up`.
1. Open the `{repo}` folder in your favorite code editor and buil something.
1. **Recommended:** Install common npm packages like linting and testing: `npm i`.
