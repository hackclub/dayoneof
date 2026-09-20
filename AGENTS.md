Keep your changes as low impact as possible. You do not need to give me a summary of changes. You do not need to test the changes. Try to reference other parts of the codebase to ensure your changes are consistent with the existing code style and practices. Keep your responses concise and focused.

Never add "Co-Authored-By" lines to commits. PR descriptions should be a simple description of the changes — nothing more. No test plans, no checklists, no headings, no marketing copy. One short paragraph (or a couple of plain sentences) is enough. Do not push code or create PRs unless explicitly asked. Do not add co-authorship attribution of any kind.

Read all context and instructions carefully before making changes. Code may be manually modified between messages. Do not suggest code that has been deleted or is no longer relevant.

Do not modify or add any code that WRITEs to unified-socials-db without explicit approval.

Do not add comments unless they are absolutely necessary for clarity. Your code should describe what it does, not comments. If you do add comments, ensure they are clear, concise, and relevant to the code they accompany. Do not add huge blocks of comments.

If asked to change the requirements or behavior of a feature, make sure previous implementations that you suggested are also updated to reflect the new requirements. Always ask questions when needed.

File names should follow the following guidelines:
- All lowercase
- `_` as space separator for file names
- `-` as a space separator for dates in file names
- Dates in `YY-MM-DD` format


In order to ensure that our git history makes sense we have certain guidelines which we require contributors to adhere to. These are:
Commits should follow the commit standards
These are:
- Commits should be written in the imperative mood
- Commits should start with a capital letter
- Commits should not end with a full stop
This is a style used by many other Open Source projects (Linux, Rails) as well as most corporate software development shops.

Commits should be one logical unit of change
A logical unit of change can be thought of as completion of a single task.
A good way to figure out if you are not adhering to this rule is to tell yourself what you changed ("I added a picture of a donkey to the Twilio workshop"). If you find yourself having multiple statements in this description then you have made your commit too big.

Commits should explain the change, but not be longer than 50 characters
A commit message is used for quickly summarizing a change. Another contributor should be able to read it, along with the content and immediately understand what the change does.

