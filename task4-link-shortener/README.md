# Link Shortener

A URL shortener built with Node.js, Express and SQLite (Node's built-in `node:sqlite`, so Node 22.5 or newer is needed).

## Features

* Short links with a random 6 character code or a custom alias
* Redirects (HTTP 302) to the original URL
* Click analytics: total clicks, last click time, clicks per day for the last 7 days, top referrers
* Input validation: only http and https URLs, alias rules, duplicate alias check
* Simple web page to create, copy, inspect and delete links

## Run

```bash
npm install
npm start          # open http://localhost:3000
```

## API

| Method and path | Purpose |
| --- | --- |
| `POST /api/shorten` | Body `{ "url": "...", "alias": "optional" }` creates a link |
| `GET /api/links` | List links with click counts |
| `GET /api/links/:code/analytics` | Analytics for one link |
| `DELETE /api/links/:code` | Delete a link |
| `GET /:code` | Redirect to the original URL and record the click |

## Tests

```bash
npm test
```
