This directory must contain the EXACT service files from your production codebase,
with the EXACT filenames shown below.

## Required Files

| Filename | Source | Purpose |
|----------|--------|---------|
| `handwriting-recognition.service.js` | Production | Main OCR service with circuit breaker |
| `openai-agent.service.js` | Production | OpenAI Vision API client |
| `gemini-agent.service.js` | Production | Gemini Vision API client (fallback) |
| `gemini-model.js` | Production | Model selection and resolution |
| `agentActions.schema.js` | Production | Gemini agent schemas (REQUIRED for imports) |

## Why We Copy (Not Edit)

These services are **100% unchanged** from production. We build the demo viewer
as a thin layer that calls the same code your team already trusts.

Changes to these files = changes to production behavior. We avoid that risk.

## Current Status

- `agentActions.schema.js`: **STUB** (temporary, will be replaced)
- Other files: Need to be copied from production

## Next Step

Copy your production service files here with the exact names above.

```bash
# Example (adjust paths to your actual source)
cp /path/to/production/services/handwriting-recognition.service.js ./
cp /path/to/production/services/openai-agent.service.js ./
cp /path/to/production/services/gemini-agent.service.js ./
cp /path/to/production/services/gemini-model.js ./
cp /path/to/production/services/agentActions.schema.js ./