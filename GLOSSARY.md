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

**Contact details**:
What a Tenant knows about a Contact beyond the phone number: name, email, city and need. The Bot captures them when the Tenant enables capture; Members see and edit them on the Contact.
_Avoid_: Lead, request, captured data

## Messaging

**Channel**:
One WhatsApp number or Instagram account that a Tenant has connected to the platform.
_Avoid_: Integration, account, connection, number

**Conversation**:
The thread of messages between one Contact and one Tenant on one Channel.
_Avoid_: Chat, ticket, thread, session

**Active Conversation**:
A Conversation that received at least one Contact message within a given period. Conversations never end, so activity over a period is measured in Active Conversations.
_Avoid_: Open conversation, new conversation, session

**Bot**:
A Tenant's configured AI responder that answers Contacts automatically.
_Avoid_: Agent, assistant, chatbot, AI

**Bot reply**:
One message the Bot sends to a Contact. Messages written by Members and template messages are not Bot replies.
_Avoid_: Credit, interaction, message

**Bot turn**:
One pass of the Bot over a Conversation's unanswered Contact messages, ending in at most one Bot reply, a Handoff, or nothing. Only one Bot turn runs per Conversation at a time, and messages that arrive during it wait for the next one.
_Avoid_: Job, run, cycle

**Handoff**:
The moment a Conversation passes from the Bot to the Tenant's Members, whether a Member takes over or the Bot steps aside.
_Avoid_: Escalation, transfer, takeover

**Handoff event**:
The record of one Handoff: when it happened, which Conversation, its reason, and whether the Bot or a Member caused it. A Handoff of a Conversation already with the team records none.
_Avoid_: Handoff log, escalation record

**Knowledge base**:
Everything a Tenant has told its Bot about the business. The Bot answers Contacts only from it.
_Avoid_: Training data, training, context, documents

**Knowledge entry**:
One piece of business information in a Tenant's Knowledge base, expressed as an FAQ or a Text section.
_Avoid_: Document, training item

**FAQ**:
A Knowledge entry consisting of a question and its answer.
_Avoid_: Prompt, question alone

**Text section**:
A Knowledge entry consisting of a title and free-form text about the business.
_Avoid_: Document, article

## Bot behaviour

**Business profile**:
What the Bot knows the business is: its name, what it offers, its address and its Business hours. Distinct from the Knowledge base, which holds what the business tells Contacts.
_Avoid_: Company info, business settings

**Behaviour settings**:
The bounded choices a Tenant's owner makes about how its Bot acts: its tone, emoji use, greeting, rules, Refused topics, Handoff topics and Schedule. They are settings, not a conversation flow, and do not include the Business profile.
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
