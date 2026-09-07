# ANUNEX Result Network production baseline

Baseline date: 2026-09-07  
Repository baseline: `f42e9dc17048cba64c7ce27a48760d19e0dfbe7c`

## Verified public surfaces

- `anunex.com`: public marketing experience.
- `app.anunex.com`: licensed application login.
- `demo.anunex.com`: Demo College role selector and login.
- `sonuc.anunex.com`: public Result Network landing page with student, institution and dealer entry points.

## Drift found at baseline

The repository version of `ResultPortal` contains password visibility, remember-me,
password-help and Turnstile controls. The live institution login did not render those
controls at the baseline date. The production Worker deployment and the browser asset
served on `sonuc.anunex.com` must therefore be accepted as separate release artifacts.

## Isolation rule

`sonuc.anunex.com` must run on `anunex-result-prod`. It shares the canonical production
D1 exam catalogue and the Result Network settings bucket, but exposes only:

- public result lookup and verification;
- the three authentication endpoints needed by institution/dealer operators;
- Result Network administration endpoints;
- the exam definition list required by Result Network administration;
- the official institution-directory import endpoint;
- health and static frontend assets.

Licensed dashboard, Nibiru chat/voice and WhatsApp APIs are not available through the
Result Network Worker.

## Release safety

The Result Network workflow is manual. It deploys and smoke-tests the isolated Worker
before `sonuc.anunex.com` can be attached. Domain attachment requires the explicit
`attach_domain` input. The previous service is recorded and restored automatically if
post-attachment acceptance fails.

The licensed application deployment owns only `app.anunex.com`; it must never reattach
`sonuc.anunex.com` to `yildiz-sinav-prod`.

No production D1 migration is run by this workflow until the independent production
recovery check is green.
