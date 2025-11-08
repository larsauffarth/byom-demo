# byomendpoint

Welcome to my Adobe I/O Application!

## Actions overview: Webhook → Data Provider → Publish

This demo showcases two App Builder actions working together to automate a Helix (Edge Delivery Services) preview → publish flow:

- **webhook**: Entry-point action invoked by an external HTTP request. It:
  - Generates a unique overlay path like `/byom-page/<timestamp>`.
  - Calls the Helix Admin API to preview that path, forwarding an optional nationality filter.
  - If preview succeeds, triggers a live publish for the same path.
- **data-provider**: Content generator for overlay paths under `/byom-page/*`. It:
  - Is invoked by the Helix Admin API when resolving the preview request initiated by the webhook.
  - Fetches a user from the Random User API (optionally filtered by nationality).
  - Renders HTML via Handlebars using `actions/data-provider/templates/user-profile.html`.

End-to-end:
1) External system calls the `webhook` action.
2) `webhook` calls Helix Admin API (preview). Admin fetch resolves content by invoking `data-provider`.
3) `data-provider` returns the rendered `user-profile.html` page.
4) If preview is successful, `webhook` calls Helix Admin API (live) to publish the page.

### Parameters and environment
- `PROJECT_COORDS` (string, required): Helix project coordinates in the form `owner/repo/ref`.
- `TOKEN` (string, required): Helix Admin API token.
- `NATIONALITY` (string, optional): Nationality code(s) forwarded to the data provider, e.g. `US`, `GB`, or `US,GB,FR`.
  - This is forwarded via the `x-content-source-location` header to the data provider.
  - The data provider uses it to call `https://randomuser.me/api/?nat=<value>`.

You can pass `PROJECT_COORDS`, `TOKEN`, and `NATIONALITY` as action parameters in the request body or configure them as environment variables.

### Try it: Invoke the webhook

Example POST with JSON body:

```bash
curl -X POST "https://<runtime-host>/api/v1/web/<namespace>/<package>/webhook" \
  -H "Content-Type: application/json" \
  -d '{
        "PROJECT_COORDS":"<owner>/<repo>/<ref>",
        "TOKEN":"<helix_admin_token>",
        "NATIONALITY":"US"
      }'
```

The response includes:
- `previewAttempts`: Each attempt’s success/failure and status.
- `previewSuccessful` / `publishSuccessful`: Booleans for the two phases.
- `pagePath`: The published overlay path (e.g., `/byom-page/1731000000000`).

To inspect the generated HTML directly via the data provider, you can call it with an overlay path (shape of the URL may vary by deployment):

```bash
curl "https://<runtime-host>/api/v1/web/<namespace>/<package>/data-provider/byom-page/123" \
  -H "x-content-source-location: US"
```

For detailed, inline documentation see:
- `actions/webhook/index.js`
- `actions/data-provider/index.js`
- `actions/data-provider/templates/user-profile.html`

## Edge Delivery configuration and indexing

This demo includes configuration files to wire your site to the overlay action and to define indexing for published overlay pages.

- Site configuration: `config/site-config.json`
  - Points `content.overlay.url` to your deployed `data-provider` action URL.
  - Associates your org/site to this repo and your content source.
- Index configuration: `config/index-config.yaml`
  - Indexes pages under `/byom-page/**` into `/user-index.json`.
  - Extracts properties from the rendered HTML meta tags in `user-profile.html` (e.g. `user-email`, `user-fullname`, etc.).

Pages are indexed when they are published. Since the `webhook` action performs a live publish after a successful preview, published overlay pages will be included in the index.

### 1) Enable the Configuration Service
Follow the guide to enable and manage the Configuration Service for your org/site. You can manage config via the Admin API or `https://tools.aem.live`.

- See: Setting up the configuration service ([docs](https://www.aem.live/docs/config-service-setup.md))

### 2) Apply the Site Configuration (Admin API)
Create or update your site configuration using the Admin API, referencing `config/site-config.json` from this repo:

```bash
curl -X PUT "https://admin.hlx.page/config/<org>/sites/<site>.json" \
  -H "content-type: application/json" \
  -H "x-auth-token: {your-auth-token}" \
  --data @config/site-config.json
```

Key fields in `site-config.json`:
- `code`: Points to this repository so the Edge Delivery runtime uses these blocks and templates.
- `content.source`: Where authored content lives.
- `content.overlay.url`: Your deployed `data-provider` action base URL, used to resolve `/byom-page/*`.

### 3) Create the Index Configuration (Admin API)
Add or update the index definition using the Admin API, referencing `config/index-config.yaml`:

```bash
curl -X POST "https://admin.hlx.page/config/<org>/sites/<site>/content/query.yaml" \
  -H "content-type: text/yaml" \
  -H "x-auth-token: {your-auth-token}" \
  --data-binary @config/index-config.yaml
```

- See: Indexing overview and behavior ([docs](https://www.aem.live/developer/indexing.md))
- See: Admin API reference for index configuration ([docs](https://www.aem.live/docs/admin.html#tag/indexConfig/operation/createIndexConfig))

## Setup

- Populate the `.env` file in the project root and fill it as shown [below](#env)

## Local Dev

- `aio app run` to start your local Dev server
- App will run on `localhost:9080` by default

By default the UI will be served locally but actions will be deployed and served from Adobe I/O Runtime. To start a
local serverless stack and also run your actions locally use the `aio app run --local` option.

## Test & Coverage

- Run `aio app test` to run unit tests for ui and actions
- Run `aio app test --e2e` to run e2e tests

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime and static files to CDN
- `aio app undeploy` to undeploy the app

## Config

### `.env`

You can generate this file using the command `aio app use`. 

```bash
# This file must **not** be committed to source control

## please provide your Adobe I/O Runtime credentials
# AIO_RUNTIME_AUTH=
# AIO_RUNTIME_NAMESPACE=
```

### `app.config.yaml`

- Main configuration file that defines an application's implementation. 
- More information on this file, application configuration, and extension configuration 
  can be found [here](https://developer.adobe.com/app-builder/docs/guides/appbuilder-configuration/#appconfigyaml)

#### Action Dependencies

- You have two options to resolve your actions' dependencies:

  1. **Packaged action file**: Add your action's dependencies to the root
   `package.json` and install them using `npm install`. Then set the `function`
   field in `app.config.yaml` to point to the **entry file** of your action
   folder. We will use `webpack` to package your code and dependencies into a
   single minified js file. The action will then be deployed as a single file.
   Use this method if you want to reduce the size of your actions.

  2. **Zipped action folder**: In the folder containing the action code add a
     `package.json` with the action's dependencies. Then set the `function`
     field in `app.config.yaml` to point to the **folder** of that action. We will
     install the required dependencies within that directory and zip the folder
     before deploying it as a zipped action. Use this method if you want to keep
     your action's dependencies separated.

## Debugging in VS Code

While running your local server (`aio app run`), both UI and actions can be debugged, to do so open the vscode debugger
and select the debugging configuration called `WebAndActions`.
Alternatively, there are also debug configs for only UI and each separate action.

## Typescript support for UI

To use typescript use `.tsx` extension for react components and add a `tsconfig.json` 
and make sure you have the below config added
```
 {
  "compilerOptions": {
      "jsx": "react"
    }
  } 
```
