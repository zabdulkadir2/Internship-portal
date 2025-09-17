# Firebase Storage Setup Instructions

## Problem
Avatar uploads are failing with CORS errors due to Firebase Storage security rules not being configured.

## Solution
Configure Firebase Storage security rules in the Firebase Console.

### Steps:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `internship-portal-a8cb1`
3. Navigate to **Storage** → **Rules**
4. Replace the existing rules with:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload/read their own avatars
    match /avatars/{userId}_{timestamp}.{extension} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Allow authenticated users to read any avatar (for displaying other users' avatars)
    match /avatars/{allPaths=**} {
      allow read: if request.auth != null;
    }

    // Default deny for all other paths
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

5. Click **Publish** to apply the rules

### What these rules do:
- **Line 4-6**: Allow authenticated users to upload/modify their own avatar files
- **Line 8-10**: Allow any authenticated user to read avatar files (needed for displaying avatars)
- **Line 12-14**: Deny access to all other storage paths by default

### File naming pattern:
Avatar files are stored as: `avatars/{userId}_{timestamp}.{extension}`
- Example: `avatars/hboTJUvrvFhMeoLme00nJvb573M2_1758061768937.jpg`

### Alternative (Temporary) Rules:
If you need a quick fix for testing, you can use more permissive rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ Warning**: The alternative rules above are less secure and should only be used for development/testing.

## After applying rules:
1. Wait 1-2 minutes for rules to propagate
2. Try uploading an avatar again
3. Check browser console for any remaining errors

## Troubleshooting:
- If you still get CORS errors, wait a few more minutes for Firebase to update
- Ensure you're logged in before trying to upload
- Check that the user is properly authenticated in the browser console
- Verify the Firebase project is active and billing is enabled (if required)