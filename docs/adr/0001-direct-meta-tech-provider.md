# Connect to WhatsApp as a direct Meta Tech Provider, not through a BSP

Tenants connect their WhatsApp numbers through our own Embedded Signup, with ClickStudio Bots enrolled as a Meta Tech Provider talking to the Cloud API directly; no BSP (Solution Partner) sits in between. Our own App Review and Advanced Access are required on either route, and Meta's docs confirm a Tech Provider can onboard WhatsApp Business app numbers in coexistence (`featureType: "whatsapp_business_app_onboarding"`), so a BSP would only add a per-Channel fee and a second dependency. Each Tenant pays Meta from its own payment method on its own WABA (BRL via Facebook Brasil where eligible); ClickStudio Bots never fronts Tenants' Meta usage.

## Considered Options

- **BSP with credit line** (360dialog, Gupshup, Infobip, Twilio, Blip, Zenvia): rejected. The credit line is only valuable if we carry Tenants' Meta usage, which we refuse; fixed per-Channel fees (e.g. 360dialog €49/month) exceed what a Brazilian SMB plan can absorb; Twilio's coexistence is unverified.

## Consequences

- We own Embedded Signup, token handling, webhooks (including `smb_message_echoes`, `history`, `smb_app_state_sync`), API version upgrades and Meta support coordination.
- Coexistence is mandatory at launch; coexistence numbers are capped at 20 mps and cannot use ordinary between-WABA migration, so leaving this route later is costly.
- No paying Tenant can be onboarded before Advanced Access; afterwards 10 new Tenants per rolling 7 days, rising to 200 after Access Verification.
- The only trigger to revisit this decision is a failed end-to-end coexistence acceptance test on a real Brazilian WhatsApp Business app number, run as an early build milestone. Slow approval is not a trigger, since a BSP needs the same approval. A fallback BSP must have documented coexistence and a dated quote under roughly R$100 per Channel per month.
