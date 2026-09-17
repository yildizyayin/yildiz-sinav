# Nibiru Live Release Checklist

## Voice activation

The voice layer is code-ready when:

1. `AI` binding is present for Turkish Whisper STT.
2. A TTS secret is provisioned in the target Worker environment:
   - preferred: `GOOGLE_TTS_SERVICE_ACCOUNT_JSON`
   - optional fallback: `OPENAI_TTS_API_KEY`
3. A Super Admin runs:

```text
POST /api/nibiru/voice/probe?mode=standard
```

A successful probe records only provider, mode, model and timestamp in D1. Secret values and audio are never stored in the health record. The status endpoint reports a provider as live-verified for 24 hours after a successful probe.

## Cloudflare/GitHub secret names

For staging GitHub Actions:

- `GOOGLE_TTS_SERVICE_ACCOUNT_JSON`
- `OPENAI_TTS_API_KEY` (optional)

For production GitHub Actions:

- `PROD_GOOGLE_TTS_SERVICE_ACCOUNT_JSON`
- `PROD_OPENAI_TTS_API_KEY` (optional)

The workflow syncs only non-empty values to the corresponding Worker secret. Do not commit either value to the repository or add it to a Wrangler vars block.

## Groq legal gate

Groq remains intentionally inactive in production until all of the following are evidenced by the legal/privacy owner:

- processor registry row approved and active,
- DPA status approved,
- customer-data training position recorded,
- international transfer mechanism approved,
- required privacy release approval records approved or waived.

The production runtime gate rejects Groq before any personal or pseudonymized academic context is sent when these records are incomplete. Code deployment must not change those records or claim legal approval.

## Release order

1. Merge code and pass typecheck, unit tests and build.
2. Deploy staging and run the live voice round trip.
3. Confirm the privacy release gate is clear for every provider intended for production.
4. Add production TTS secret(s) in the production environment.
5. Run the production deploy workflow.
6. Run read-only production smoke and verify text chat, push-to-talk transcription and TTS playback.

