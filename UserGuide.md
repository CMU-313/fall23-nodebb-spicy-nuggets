# Feature Outline

Endorsement Feature → attempts to solve “As a teacher and TA, I want to be able to publicly endorse different responses by students so I can openly verify that their answer is correct and can be referenced by other students.”

How to Use:
Create a post
Click endorse
There should be a banner with green text to confirm this.
Click unendorse
The banner should disappear
Click unendorse when it’s already endorsed
There should be a warning telling the user they cannot do this action.

Automated Tests
Can be found in src/tests/post.js
These tests should be enough for now.
This is testing if toggling the endorse button back and forth works correctly and if endorsed posts have a visual change

Anonymous username using checkbox → attempts to solve “As a student I want to anonymously ask questions to my class so I can get help quicker while helping my peers who may have similar questions, while not feeling embarrassed/shy about my question.”
Note: this feature is not fully supported by the code but this is how it was meant to work

How to Use:
Under profile settings check the box that is titled “post_anonymously”
Create a post
The username titled for the post should be labeled as “Anonymous”

Automated Tests
Found in src/tests/post.js
This is testing whether the username displayed on an anonymous post (when the checkbox is selected) is anonymous
