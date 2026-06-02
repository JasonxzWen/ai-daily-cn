# Refactoring

Refactor only while tests are green.

Good refactor candidates:

- repeated setup or assertions in several behavior tests
- duplicated production logic created by earlier green steps
- shallow pass-through modules that add interface cost without leverage
- names that now conflict with the domain language discovered during implementation

Avoid:

- cleanup unrelated to the current behavior
- abstractions created for only one caller
- large rewrites while a test is red
- deleting pre-existing dead code unless the user asked

Run the relevant tests after each meaningful refactor step.
