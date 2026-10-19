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
