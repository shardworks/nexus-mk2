# "Parlour" page for oculus

I would like to update the Parlour apparatus so that it exports an Oculus page. 

## UI

This page should provide a user interface for having a realtime conversation with an anima. It should have the components listed below.

### Chat UI

Chat controls, including: 

- a large, scrollable text area with cleanly styled and formatted conversation turns between the user and an anima
- a message box (containing 3 lines of text, and expandable) where users can enter chat messages, possibly including newlines
- a submit/send button which sends the message to the anima; pressing 'ctrl+enter' in the chatbox should also send the message

Within the chat box, the user's messages and anima messages should be styled and/or positioned so that they are clearly differentiated. Additional, anima 'thinking' messages should be styled in a slightly more subdued manner than normal anima messages. Omit tool call messages entirely, or display them in a very minimalistic/summarized way inline.

When the UI is waiting for the anima to respond, there should be a spinner, animation, or other clear indicator that a response is pending. The 'submit'/'send' button should be disabled at this time, and the system should reject attempts to send multiple messages between an anima turn.

### Anima Selector

There should be a dropdown from which the user can select which anima they wish to speak with, by role. All roles in the system should be included in the list, sorted by name.

### Session Selector

When an anima is selected, a sidebar (similar to what is used on ChatGPT or Claude's web ui) listing existing conversations is presented. Selecting a conversation from here populates the main chat UI with its history and allows the user to continue the conversation. An appropriate short title can be displayed, or if there is no suitable field for conversations a date/time will work. Conversations should be sorted by their createdAt dates for now.

There should also be a way to 'end' conversations, setting their status in the appropriate Stacks Book, after which it is no longer displayed in the session selector. Additionally, there should be a way to start a new conversation fresh (which is the default when an anima is selected and no conversation is picked.)

### Cost Card

A card should be displayed beneath the conversation UI summarizing the cost of the conversation, both in tokens and USD.
