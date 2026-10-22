# ClickStudio Bots

A multi-tenant platform where businesses connect their WhatsApp and Instagram accounts and let an AI responder answer their customers, with a dashboard to follow and take over conversations.

## Parties

**Tenant**:
A business that subscribes to the platform; the unit of billing and data isolation.
_Avoid_: User, client, account, company, workspace

**Member**:
A person who logs into a Tenant's dashboard, such as an owner or an attendant.
_Avoid_: User, agent, operator

**Contact**:
An end customer who messages a Tenant through one of its Channels.
_Avoid_: Customer, lead, user, client

## Messaging

**Channel**:
One WhatsApp number or Instagram account that a Tenant has connected to the platform.
_Avoid_: Integration, account, connection, number

**Conversation**:
The thread of messages between one Contact and one Tenant on one Channel.
_Avoid_: Chat, ticket, thread, session

**Bot**:
A Tenant's configured AI responder that answers Contacts automatically.
_Avoid_: Agent, assistant, chatbot, AI

**Bot reply**:
One message the Bot sends to a Contact. Messages written by Members and template messages are not Bot replies.
_Avoid_: Credit, interaction, message

**Handoff**:
The moment a Conversation passes from the Bot to the Tenant's Members, whether a Member takes over or the Bot steps aside.
_Avoid_: Escalation, transfer, takeover

**Knowledge base**:
Everything a Tenant has told its Bot about the business. The Bot answers Contacts only from it.
_Avoid_: Training data, training, context, documents

## Bot behaviour

**Behaviour settings**:
The bounded choices a Tenant's owner makes about how its Bot presents itself and answers, such as its tone, greeting, rules, Business hours and Schedule. They are settings, not a conversation flow.
_Avoid_: Bot config, flow, prompt

**Business hours**:
When a Tenant is open to Contacts: at most one opening interval per weekday, in São Paulo time.
_Avoid_: Opening times, working hours, office hours

**Schedule**:
When a Tenant's Bot may reply: always, or only outside Business hours. Being outside it pauses the Bot but never causes a Handoff.
_Avoid_: Availability, shift, Bot hours

**Refused topic**:
A subject the Bot politely declines to discuss, without a Handoff.
_Avoid_: Blocked topic, forbidden subject

**Handoff topic**:
A subject that always makes the Bot hand the Conversation to the Tenant's Members.
_Avoid_: Escalation topic, transfer topic
