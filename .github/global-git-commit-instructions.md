Commit message should be clear and concise, summarizing the changes made in the commit. Here are some guidelines to follow when writing commit messages:
1. First part of the commit should contain jira issue number. You can fint the issue number from the branch name. You can search for the issue number in the branch name using following regex: (CCB(AB|TMB|PD)|BOS|ABBOS)-\d{,6}
   1.1. Example branch name looks like this: feature/CCBAB-1234_add_new_feature, where CCBAB-1234 is the jira issue number.
   1.2. If branch does not contain jira issue number, you can skip the issue number part in the commit message.
2. After the issue number add space. Example: "CCBAB-1234 "
3. Add a short summary of the changes made in the commit. The summary should be written in imperative mood, meaning it should describe what the commit does, rather than what was done. For example, use "Add new feature" instead of "Added new feature" or "Adding new feature".
4. Keep the summary under 50 characters.
5. Example commit message: "CCBAB-1234 Add new feature to improve performance"