Fix: Anima git identity should only override GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL, not GIT_COMMITTER_NAME and GIT_COMMITTER_EMAIL. The committer identity must remain the system default so that commit signatures stay verified on GitHub. Remove the two GIT_COMMITTER_* lines from the Loom identity derivation. Update any tests that assert on committer fields.

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.