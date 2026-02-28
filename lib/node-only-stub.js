// Stub module replacing Node.js-only packages in edge/Cloudflare Worker builds.
// These packages (libsql, @libsql/client, chromadb, ollama) are only used in
// local development code paths that are never reached in production where
// Cloudflare D1 and Vectorize bindings are always provided.
module.exports = {};
