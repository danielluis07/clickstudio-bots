# Meta App Review for a WhatsApp Tech Provider: evidence

Retrieved 2026-10-19 from developers.facebook.com, mostly through the Markdown versions of the pages (append `.md` to a WhatsApp docs URL). Some general App Review pages came back in pt-BR or rendered empty, as noted below. No credentials were used and nothing was submitted. Wording is paraphrased; the URLs are authoritative. Meta pages show no "last updated" dates unless stated. Anything marked **unverified** comes only from third-party sources or could not be read on a Meta page.

Context: ClickStudio Bots goes direct as a Tech Provider, with no Solution Partner ([ADR 0001](../adr/0001-direct-meta-tech-provider.md)). Business verification is done. The app has no App Review, no Advanced Access and no Embedded Signup configuration yet.

## Sources

| Short name | URL |
| --- | --- |
| WA App Review | https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review (old `/docs/whatsapp/solution-providers/app-review` redirects here with a 301) |
| Become a Tech Provider | https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers |
| WA Permissions | https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions |
| ES Overview | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview |
| ES Implementation | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation |
| ES v4 | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4 |
| TP Onboarding | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider |
| Coexistence | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users |
| Webhooks Overview | https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview |
| WA Changelog | https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog |
| FL4B | https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business |
| Access Verification | https://developers.facebook.com/documentation/development/release/access-verification |
| Tech Providers (general) | https://developers.facebook.com/docs/development/release/tech-providers/ (pt-BR rendering) |
| Access levels | https://developers.facebook.com/docs/graph-api/overview/access-levels (pt-BR rendering) |
| AR Submission walkthrough | https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide |
| AR Overview | https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review |
| AR Introduction | https://developers.facebook.com/docs/app-review/introduction (pt-BR rendering) |
| AR Screen recordings | https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings (pt-BR rendering) |
| AR Common mistakes | https://developers.facebook.com/docs/app-review/submission-guide/common-mistakes (pt-BR rendering) |
| Basic Settings | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings |
| Data deletion callback | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback |
| Platform Terms | https://developers.facebook.com/terms/ (pt-BR rendering, updated 3 Feb 2026) |

Pages that rendered empty and were **not** read: `.../solution-providers/access-verification`, `.../app-review/AR-FAQs`, `.../app-review/after-you-submit` (redirects to `/docs/resp-plat-initiatives/app-review/after-you-submit`).

## 1. Permissions to request

**Request Advanced Access for exactly these two:**

- `whatsapp_business_management`. Covers WABA/Messaging-account metadata, phone-number lists, templates, analytics, and **all webhooks other than `messages` and `calls`**. Without Advanced Access, calls on accounts the business does not own fail with error `200`. (WA Permissions, WA App Review, Webhooks Overview)
- `whatsapp_business_messaging`. Covers sending messages, media upload and retrieval, the business profile, phone-number registration, and the `messages` webhooks (inbound messages and statuses). (WA Permissions, WA App Review, Webhooks Overview)

Become a Tech Provider says these two are "required to become a Tech Provider". ES v4 lists the same two as the required permissions for the Cloud API product, and says v4 selects them for you when you choose that product.

**Coexistence needs no extra permission.** Coexistence lists its own requirements: Business app version 2.24.17 or later, Tech Provider status, Embedded Signup with session logging, and a webhook that works. It names no extra permission. Its webhook fields `history`, `smb_app_state_sync`, `smb_message_echoes` and `account_update` count as "all other webhooks", so they fall under `whatsapp_business_management` (Webhooks Overview). Inference: the two permissions above cover coexistence.

**Not needed, and requesting them risks rejection.** WA App Review warns that requesting permissions you don't need is a common reason for rejection.

- `business_management`: needed "only" for programmatic access to a business portfolio, which Meta calls rarely needed (WA Permissions). ES Overview mentions it only for Solution Partners sharing a credit line. It is also on the Access Verification list. Do not request it.
- `whatsapp_business_manage_events` and `ads_read`: only for the Marketing Messages API combined with the Conversions or Insights API (WA Permissions). Do not request them.
- Instagram, Pages, ads and catalog permissions: out of scope.

**`public_profile` / `email`.** FL4B says these can only be requested together with another business permission. FL4B's FAQ also says Advanced Access to `public_profile` "is required" for Facebook Login for Business apps before they go live, so that external users can authorize. Access levels: business apps created before 16 Feb 2021 had Advanced Access for `email`/`public_profile` approved automatically. The page does not say how this works for newer business apps. **Action:** check in App Review > Permissions and Features whether `public_profile` already shows Advanced Access. If it doesn't, request it. Don't request `email` unless the product uses it.

## 2. Onboarding order and what each gate unlocks

The order from Become a Tech Provider and ES Overview:

1. Create a Meta app with the WhatsApp use case (or a business-type app) and connect the business portfolio.
2. Go to App Dashboard > Use cases > Customize (WhatsApp) > **Tech Provider onboarding**. Choose "Onboard without a partner".
3. Step 1, **Business Verification**. Already marked complete for us if the verified portfolio is linked.
4. Step 2, **App Review**: basic app settings, two videos, then Advanced Access for the two permissions. Click "Begin App Review". WA App Review says you can start before Embedded Signup is finished.
5. Configure Embedded Signup (ES Implementation):
   - FL4B > Settings: turn on Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Strict Mode for redirect URIs, and Login with the JavaScript SDK.
   - Add the HTTPS hosting domains to Allowed domains and to Valid OAuth redirect URIs.
   - FL4B > Configurations: use the template "WhatsApp Embedded Signup Configuration With 60 Expiration Token", or create a configuration with the "WhatsApp Embedded Signup" login variation.
   - Save the **configuration ID** as `config_id`.
   - Launch with `FB.login({config_id, response_type:'code', override_default_response_type:true, extras:{...}})`. Register a `message` listener for `WA_EMBEDDED_SIGNUP` events. That listener is session logging, and coexistence requires it.
   - The returned code expires in 30 seconds.
   - Subscribe to `account_update`.
   - For coexistence, add `featureType: "whatsapp_business_app_onboarding"` (with `sessionInfoVersion: "3"`) and subscribe to `history`, `smb_app_state_sync` and `smb_message_echoes` (Coexistence).
6. Per Tenant (TP Onboarding): exchange the code for a business token, subscribe the app to the customer's WABA, register the phone number, then send a test message. For coexistence, sync contacts with `smb_app_state_sync`, which can be done only once, then history, **within 24 hours** of onboarding. Otherwise the business must be offboarded (Coexistence).
7. The Tenant adds its own payment method.

**Embedded Signup v2 and v3 were deprecated on 15 Oct 2026** (banner on ES pages). That date has passed, so build on **v4** only. ES v4 says Business app onboarding "continues to be supported" through the `feature_type` parameter. The Coexistence code sample still shows `featureType`, so check the exact v4 key during implementation.

**The gates compared:**

| Gate | What it is | What it unlocks |
| --- | --- | --- |
| Business Verification | Meta verifies the legal entity (Basic Settings). Required before App Review (Become a Tech Provider) and for Advanced Access (Access levels). | Prerequisite only. Done for us. |
| App Review | Meta tests the app against each requested permission (AR Overview). | Advanced Access. Without it, permissions don't appear in the Embedded Signup flow once the app is Live, and no business customers can be onboarded (ES Overview). |
| Access Verification | A business-level check that the business is a Tech Provider: an admin describes how the business uses other businesses' data. Decision in about 5 days. Prerequisite: Business Verification and no restrictions on the business. Form at App Dashboard > Basics > Verifications > Access verification. An email is triggered when an admin requests Advanced Access for a listed permission, and `whatsapp_business_management` is on that list. If it is missing, calls on behalf of users without an app role fail with error `100`. (Access Verification) | Per ES Overview, the onboarding limit rises **from 10 to 200 new business customers per rolling 7 days** after Business Verification, App Review **and** Access Verification. For more than 200, apply to be a Meta Business Partner. Only *new* customers count. The current count is shown in WhatsApp Manager > Partner overview. |

**Conflict to resolve in the dashboard.** WA Changelog, 3 Oct 2025: access verification "is no longer required to become a Tech Provider". ES Overview, still current, ties the 200 limit to Access Verification. The general Access Verification page still lists `whatsapp_business_management`. Plan for Access Verification anyway (about 5 days, run in parallel with App Review), and expect a limit of **10/week** until it is complete.

## 3. What the App Review submission needs

**WhatsApp-specific** (WA App Review, Become a Tech Provider):

- **One video per permission, plus a written description per permission.** If either is missing, the submission is rejected. Don't show several permissions in one video. Screenshots are not accepted.
- `whatsapp_business_messaging` video: send a message from our app to a WhatsApp number, and show the WhatsApp client (web or mobile) receiving and displaying it. Alternative: a recording of the API Setup cURL request sending to a test recipient. Written part: explain the messaging functions Tenants get and how they use them.
- `whatsapp_business_management` video: "your app, or WhatsApp Manager, being used to create a message template". Written part: explain how we access onboarded clients' assets.
- You can submit both in one bulk submission or separately. Drafts are not reviewed.
- Test users must have a `developer` or `admin` role on the app.

**General App Review rules** (AR Submission walkthrough, AR Screen recordings, AR Common mistakes):

- Before you can request a permission, make **at least one successful API call** with it in the 30 days before submitting. The "Request advanced access" button stays grey until the call is logged, which takes up to 2 days. Make calls with both permissions early in week 5, or the week before.
- Recordings:
  - 1080p or higher, with monitor width at 1440 or less, a large cursor, and mouse rather than keyboard.
  - **No audio**; reviewers don't listen.
  - English UI if possible. If the UI is not in English (our pt-BR UI), **add English captions and tooltips** and explain non-obvious buttons.
  - Show the full login flow, starting logged out. Show the user granting the permission through the business login (Embedded Signup authorization screen), then using the feature.
  - Every requested permission without a recording is not approved.
- Reviewers test the app themselves. It must be publicly available, or you must give access instructions under App Verification > Platform Settings.
  - If users sign in with Meta login, answer "Yes"; reviewers use **their own test accounts**.
  - Never give your personal Meta credentials. Fake-account credentials get the whole submission rejected.
  - If reviewers can't access the app, the **entire** submission is rejected. If they can't test one feature, that feature is not approved.
  - Inference: reviewers will need a login to ClickStudio's own app (a reviewer test account on our auth) plus the instructions.
- Usage description: specific to each permission: how it helps users, why it's needed, how the data is used, and why the app would be worse without it. **No copy-paste** between permissions.
- After that: answer the data handling questions, accept the Platform Onboarding Terms, then submit.

**Test WhatsApp numbers.**

- API Setup gives a test business phone number and WABA for sending to added "To" recipients (Cloud API Get Started: `.../whatsapp/get-started`).
- The commonly cited limit of 5 test recipients was **not found on the Meta page (unverified)**.
- The Embedded Signup **sandbox account** (WhatsApp > Quickstart > Testing Integrations > Claim sandbox account) lets you rehearse the flow and the token exchange. It is valid for 30 days, and its number **cannot send or receive messages** (ES Overview). So it can't be used for the messaging video.

## 4. App-level prerequisites (Basic Settings, Platform Terms)

- **Required to go Live:**
  - Display Name: no "WhatsApp", "FB" or other Meta brands.
  - Contact Email.
  - **Terms of Service URL**.
  - **App Icon**: 1024x1024, no Meta or WhatsApp logos.
  - **Category**.
  - **App Purpose**: set it to "Clients".
- **Privacy Policy URL**:
  - It is shown on Meta's authorization screens.
  - Platform Terms §4 requires a live, **publicly available**, easily accessible URL that is **not geo-blocked**, entered in the App Dashboard field.
  - It must clearly state what data is processed, how, for what purposes, and **how users can request deletion**.
  - Platform Data may be processed only as described in it, so it must match what the app does.
- **User Data Deletion**: either an instructions URL (which can be a section of the privacy policy) or an HTTPS callback that returns `{url, confirmation_code}` (Data deletion callback). The Platform Terms require the privacy policy to explain deletion in either case.
- **App Domains / Platform**: add a Website platform, and add App Domains matching the Embedded Signup host. FL4B also needs HTTPS Allowed domains and redirect URIs (ES Implementation).
- **Primary Contact**: App Review emails go to this address.
- **Business Verification**: done.
- **Language:** no Meta page read states a language requirement for the policy or the terms. pt-BR pages appear allowed. **Recommendation (inference):** because reviewers work in English, publish an English version of the privacy policy alongside the pt-BR one, or at least make sure the pt-BR one clearly covers WhatsApp data and deletion.

## 5. Timing, rejections, resubmission, testing before approval

- Duration:
  - WA App Review: "average turnaround … about 24 hours".
  - AR Submission walkthrough: a decision "within a week".
  - AR Introduction: usually under a week, sometimes 2 to 3 days, longer at peak times.
  - Access Verification: about 5 days.
- How you hear the result: developer notifications under Alerts > Inbox, status under App Review > Requests, and email to the Primary Contact (AR Introduction, AR Submission walkthrough).
- **Resubmission:**
  - Permissions are approved or rejected one by one: an untestable feature is "not approved" while the rest can pass (AR Overview).
  - Permissions can be sent in separate submissions (WA App Review). This implies you can resubmit only the rejected one.
  - Changing basic or advanced settings after submitting can trigger re-review.
  - The pages that cover resubmission and limits (`after-you-submit`, `AR-FAQs`) rendered empty, so **any limit on the number of resubmissions is unverified**. No Meta page read sets one.
- **Before Advanced Access:**
  - Business apps get Standard Access automatically. Standard Access works only for users with a role on the app (Access levels, WA App Review).
  - A direct developer using only its own business data needs neither App Review nor Advanced Access (WA Permissions).
  - In Development mode, Embedded Signup shows the permissions to admin, developer and tester roles (ES Overview).
  - So **ClickStudio can onboard its own WABA/number** (owned by its own verified portfolio, by a person with an app role) and use it for development and the review videos.
  - **Paying Tenants cannot be onboarded until App Review approves Advanced Access**: "You will not be able to onboard business customers until..." (ES Overview).
  - Caveat: Coexistence requires that you "already be a Solution Partner or Tech Provider". Whether coexistence onboarding of ClickStudio's own Business-app number works before approval is **unverified**; test it early.
  - Don't switch the app to Live before approval. Live mode limits even role users to approved permissions (AR Submission walkthrough).

## 6. Must we demonstrate template creation?

Yes, as Meta's docs stand. Both WA App Review and Become a Tech Provider name creating a message template as **the** video for `whatsapp_business_management`. No alternative use case is offered, even though the permission also covers webhooks, phone numbers and account metadata. The cheapest compliant option the docs offer is "**WhatsApp Manager** being used to create a message template". Our UI then doesn't need a template builder. Third-party guides (Twilio, Infobip, 360dialog; see `meta-onboarding-routes.md` on `origin/research/meta-onboarding-routes`) say the same. Submitting a different demonstration (webhook subscription, history sync) instead of a template is **not documented** and risks rejection. If you do it, add a second clip of the WhatsApp Manager template, and use the written description to explain the real use: account and phone-number reads, coexistence webhooks.

## Open items to check in the authenticated dashboard

1. Whether Access Verification is offered or required for this app, given the conflict in §2.
2. Whether `public_profile` already has Advanced Access.
3. The exact key for v4 coexistence (`feature_type` vs `featureType`).
4. Coexistence onboarding of ClickStudio's own number before approval.
5. Resubmission limits (FAQ page unreadable).
