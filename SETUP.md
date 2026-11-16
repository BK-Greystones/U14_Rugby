# Setting up the Greystones U14 match tracker

### A step-by-step guide for first-timers

This guide assumes you have never set up a website, a database or a login system before. Every step says exactly where to click, what you should see, and why you're doing it. Take it slowly and tick off each box as you go.

Allow about **45 minutes** for the first time. You only do this once.

---

## Contents

1. [Before you start](#before-you-start)
2. [How it all fits together](#how-it-all-fits-together)
3. [What each file does](#what-each-file-does)
4. [Step 1: Unzip the files](#step-1-unzip-the-files)
5. [Step 2: Create your Firebase project](#step-2-create-your-firebase-project)
6. [Step 3: Get your Firebase settings](#step-3-get-your-firebase-settings)
7. [Step 4: Turn on coach sign-in](#step-4-turn-on-coach-sign-in)
8. [Step 5: Create the database and its security rules](#step-5-create-the-database-and-its-security-rules)
9. [Step 6: Create the coach accounts](#step-6-create-the-coach-accounts)
10. [Step 7: Put the files on GitHub](#step-7-put-the-files-on-github)
11. [Step 8: Add your settings to the website](#step-8-add-your-settings-to-the-website)
12. [Step 9: Tell Firebase your website's address](#step-9-tell-firebase-your-websites-address)
13. [Step 10: Test everything](#step-10-test-everything)
14. [Optional extra security](#optional-extra-security)
15. [Using it on matchday](#using-it-on-matchday)
16. [Looking after it during the season](#looking-after-it-during-the-season)
17. [If something goes wrong](#if-something-goes-wrong)
18. [Glossary](#glossary)
19. [Appendix: for the curious](#appendix-for-the-curious)

---

## Before you start

You will need:

- [ ] **A computer** (Windows or Mac). A phone is not enough for set-up, though you'll use phones afterwards.
- [ ] **A Google account** (a Gmail address works). Firebase belongs to Google and uses this to sign you in. A club or committee Google account is better than a personal one, so the project doesn't depend on one person.
- [ ] **The GitHub account** that currently hosts your tracker, and its password.
- [ ] **The zip file** `grfc-u14-tracker.zip`, downloaded to your computer.
- [ ] **The email addresses** of each coach who needs to score matches.
- [ ] **A notepad.** Use paper, or a text file such as Notepad (Windows) or TextEdit (Mac), to jot down a few values as you go.

**Will it cost anything?** No. Firebase's free plan (called **Spark**) needs no credit card. It allows tens of thousands of score updates and page views a day, far more than a youth rugby club will use. GitHub Pages is also free.

> **Tip:** Screens on the Firebase and GitHub websites change from time to time. If a button is worded slightly differently from this guide, look for the closest match. The steps themselves stay the same.

---

## How it all fits together

Before clicking anything, it helps to know what the pieces are. There are four, and each has one job.

```
          ┌───────────────────────────┐
          │  GITHUB PAGES             │   Holds the app itself (the "website").
          │  yourname.github.io/...   │   Everyone's phone downloads it from here.
          └─────────────┬─────────────┘
                        │ the app loads on each phone
      ┌─────────────────┼───────────────────────┐
      ▼                                         ▼
┌─────────────┐                         ┌─────────────────┐
│ COACH'S     │                         │ PARENTS' PHONES │
│ PHONE       │                         │ (no login)      │
│             │                         │                 │
│ Team sheet  │                         │ Only watch the  │
│ locked in a │                         │ live score      │
│ "safe" here │                         └────────▲────────┘
└──────┬──────┘                                  │
       │ 1. Coach signs in          3. Database sends the
       │ 2. Coach taps "Try"           new score to every
       ▼                               watching phone within
┌──────────────────────────────────┐   about a second
│ FIREBASE (Google)                │─────────┘
│                                  │
│  Authentication: checks the      │
│  coach is who they say they are  │
│                                  │
│  Firestore database: holds the   │
│  live score and results          │
│                                  │
│  Security rules: the rulebook    │
│  the database enforces           │
└──────────────────────────────────┘
```

**GitHub Pages is the noticeboard.** It stores the app's files and hands them to anyone who visits the address. It can't remember anything that happens during a match. You already use it today.

**Firebase Authentication is the club membership desk.** When a coach signs in with their email and password, it checks they're a real account and gives their phone a "membership card" that proves who they are.

**The Firestore database is the scoreboard in the clubhouse.** It holds the current score, clock and match log for each squad, plus finished results. Whenever it changes, it instantly tells every phone that's watching. That's how parents see a try within a second of the coach tapping the button.

**The security rules are the rulebook pinned beside the scoreboard.** In plain English they say:

- "Anyone may *look* at the scoreboard."
- "Only people on the coaches list may *change* it, and only in sensible ways."

The rules are enforced by Google's servers, not by the app. So even someone clever who copies or alters the app on their own computer can't change your scores.

**The coach's phone is a locked safe.** Children's personal details (names, dates of birth, IRFU numbers, schools and signatures) never go to Firebase. They're stored only on the coach's phone, scrambled (encrypted) with a passphrase the coach chooses. Without the passphrase, the stored data is unreadable gibberish.

### Two different "passwords", don't mix them up

| | **Sign-in password** | **Team sheet passphrase** |
|---|---|---|
| What it protects | Your coach account (who can change scores) | The player details on *one particular phone* |
| Where it's checked | Firebase, on Google's servers | Only on that phone. Nobody else ever sees it. |
| Who creates it | You, in Step 6 (coaches can change it later) | Each coach, the first time they open the Sheet tab |
| If forgotten | Use "Forgot password?" to get a reset email | It can't be recovered. Erase the sheet and paste it in again. |

### What happens when there's no signal at the pitch

The app keeps working. Scores are saved on the coach's phone and sent to the database as soon as signal returns. A small line under the tabs tells the coach "Offline", "Saving…" or "All changes saved". Parents see the updates once the coach's phone reconnects.

### Why your Firebase settings are visible to everyone

In Step 8 you'll paste some Firebase settings (including something called an "API key") into a file that anyone can see. That's normal and safe. It's like printing the club's address on a sign: it tells the app *where* the database is, but it isn't a key to the door. The security rules are the lock, and only the coaches list gets through.

---

## What each file does

When you unzip the download, you'll see these files and folders. Only two need you to edit them, and only one of those (fixtures) ever needs editing again.

| File or folder | What it is | Do you edit it? |
|---|---|---|
| `index.html` | The app's main page. This is what opens when someone visits your site. | No |
| `css/` | Colours, sizes and layout. | No |
| `js/` | The app's code. | Only `firebase-config.js` (once, in Step 8) |
| `js/firebase-config.js` | Tells the app which Firebase project is yours. | **Yes, once** |
| `data/fixtures.json` | Squad names, fixtures and league tables. | **Yes, when fixtures change** |
| `fonts/` | The lettering the app uses, stored with the app so it doesn't fetch fonts from Google. | No |
| `vendor/` | Ready-made tools the app relies on: Firebase's own code and a PDF maker. Kept here so the site never loads code from anywhere else. | No |
| `firestore.rules` | The security rulebook. You'll copy its contents into Firebase in Step 5. | No (just copy it) |
| `favicon.svg` | The small rugby-ball icon in the browser tab. | No |
| `GRFC_U14_rugby_tracker.html` | Has the same name as your old tracker, so anyone using the old link or bookmark is sent to the new app automatically. | No |
| `SETUP.md` | This guide. | No |
| `README.md` | A short note shown on your GitHub page pointing to this guide. | No |

---

## Step 1: Unzip the files

**Why:** The download is a zip file, a single parcel containing everything. You need to unpack it so you can upload the individual files to GitHub.

- [ ] **1.** Find `grfc-u14-tracker.zip` in your **Downloads** folder.
- [ ] **2.** Unpack it:
  - **Windows:** right-click the zip → **Extract All…** → **Extract**.
  - **Mac:** double-click it.
- [ ] **3.** Open the new folder. You should see `index.html`, `SETUP.md`, `firestore.rules` and the folders `css`, `data`, `fonts`, `js` and `vendor`.

> **Watch out:** If you open the folder and see *only another folder* inside it, go into that one. You want the level where `index.html` sits.

---

## Step 2: Create your Firebase project

**Why:** A "project" is your club's own private space in Firebase. It will hold the login system and the database.

- [ ] **1.** Go to **https://console.firebase.google.com** and sign in with the Google account you chose.
- [ ] **2.** Click **Create a project** (or **Add project**, or **Get started with a Firebase project**).
- [ ] **3.** **Project name:** type something like `greystones-u14`. Firebase may add some random letters to the end. That's fine.
- [ ] **4.** Accept the terms if asked, and click **Continue**.
- [ ] **5.** If you're asked about **Gemini** or **AI assistance**, you can turn it off. The tracker doesn't use it.
- [ ] **6.** When asked about **Google Analytics**, switch it **off**. The tracker doesn't use it, and leaving it off means fewer data-protection questions.
- [ ] **7.** Click **Create project**, wait about 30 seconds, then click **Continue**.

**What you should see:** the project's home page, with your project name at the top left and a menu down the left side.

---

## Step 3: Get your Firebase settings

**Why:** The app needs to know which Firebase project is yours. Firebase gives you a short block of settings to copy for this. Registering a "web app" is just how Firebase hands those settings out.

- [ ] **1.** On the project home page, find the row of round icons under "Get started by adding Firebase to your app". Click the one that looks like **`</>`** (it means "Web").
  - If you can't see it: click the **gear icon ⚙** at the top left → **Project settings** → scroll to **Your apps** → click **`</>`**.
- [ ] **2.** **App nickname:** type `tracker`.
- [ ] **3.** **Leave the "Firebase Hosting" box unticked.** You're using GitHub for hosting.
- [ ] **4.** Click **Register app**.
- [ ] **5.** You'll see a box of code. Look for a part like this (your values will be different):

  ```js
  const firebaseConfig = {
    apiKey: "AIzaSyB1a2b3c4d5e6f7g8h9i0jKlMnOpQrStUv",
    authDomain: "greystones-u14.firebaseapp.com",
    projectId: "greystones-u14",
    storageBucket: "greystones-u14.firebasestorage.app",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123def456"
  };
  ```

- [ ] **6.** Copy these **four** values into your notepad, exactly as shown, without the quote marks:
  - `apiKey`
  - `authDomain`
  - `projectId`
  - `appId`

  You don't need the others.
- [ ] **7.** Click **Continue to console**.

> **Lost them?** You can always find them again: **gear icon ⚙ → Project settings → General**, then scroll to **Your apps** and choose **Config**.

---

## Step 4: Turn on coach sign-in

**Why:** This switches on the "membership desk", so coaches can sign in with an email and password.

- [ ] **1.** In the left menu, click **Build** (or **All products**), then **Authentication**.
- [ ] **2.** Click **Get started**.
- [ ] **3.** You're now on the **Sign-in method** tab. Under **Native providers**, click **Email/Password**.
- [ ] **4.** Switch on the **first** toggle, **Email/Password**.
- [ ] **5.** Leave the second toggle, **Email link (passwordless sign-in)**, **off**.
- [ ] **6.** Click **Save**.

**What you should see:** Email/Password listed with the status **Enabled**.

**Optional but recommended:** stop strangers from creating accounts.

- [ ] **7.** Click the **Settings** tab (at the top of the Authentication page).
- [ ] **8.** Look for **User actions**. If you see **Enable create (sign-up)**, untick it and click **Save**.

Now only accounts you create can exist. If you don't see this option, don't worry. A stranger who somehow made an account still couldn't change anything, because they won't be on the coaches list you create in Step 6.

---

## Step 5: Create the database and its security rules

**Why:** This creates the "scoreboard in the clubhouse", then pins up the rulebook that controls who can change it.

### 5a. Create the database

- [ ] **1.** In the left menu, click **Build** (or **All products**), then **Firestore Database**.
- [ ] **2.** Click **Create database**.
- [ ] **3.** If asked to choose an **edition**, choose **Standard**.
- [ ] **4.** **Database ID:** leave it as `(default)`.
- [ ] **5.** **Location:** choose a European location, such as **eur3 (Europe)** or **europe-west1 (Belgium)**.
  - **Why Europe?** It keeps the data within the EU, which is simpler for data-protection rules.
  - **This can't be changed later**, so double-check before continuing.
- [ ] **6.** When asked how to start, choose **Start in production mode**.
  - **Why:** "Production mode" starts with everything locked. "Test mode" would leave the database open to anyone for 30 days, which you don't want.
- [ ] **7.** Click **Create** and wait a minute.

**What you should see:** an empty database page with tabs along the top: **Data**, **Rules**, **Indexes** and others.

### 5b. Add the security rules

- [ ] **1.** On your computer, open the unzipped folder and open `firestore.rules` with a plain text editor:
  - **Windows:** right-click → **Open with** → **Notepad**.
  - **Mac:** right-click → **Open With** → **TextEdit**.
- [ ] **2.** Select everything (**Ctrl+A** on Windows, **Cmd+A** on Mac) and copy it (**Ctrl+C** or **Cmd+C**).
- [ ] **3.** Back in Firebase, click the **Rules** tab.
- [ ] **4.** Click inside the big text box. Select everything there (**Ctrl+A** or **Cmd+A**) and delete it.
- [ ] **5.** Paste the rules you copied (**Ctrl+V** or **Cmd+V**).
- [ ] **6.** Click **Publish**.

**What you should see:** a message saying the rules were published, and no red error marks in the text box.

> **If you see a red error:** part of the text was probably missed when copying. Repeat from 5b step 1, making sure you select *all* of the file. The first line should read `rules_version = '2';` and the last line should be `}`.

**What these rules say, in plain English:**

- Anyone can **read** the live matches and results. That's the parents' view.
- Only signed-in accounts that appear in a list called **admins** (your coaches list) can **change** anything.
- Every change must look like a real match: team names under 40 characters, sensible numbers, no unexpected extra information. A tampered or corrupted change is rejected.
- Nothing else in the database can be read or written by anyone.

---

## Step 6: Create the coach accounts

**Why:** Two things need to happen for each coach:

1. They need an **account**, so they can sign in.
2. They need to be added to the **coaches list**, so the rules let them change scores.

Having an account alone isn't enough. That's deliberate, so that only people you approve can score.

### 6a. Create each coach's account

- [ ] **1.** Go to **Authentication** in the left menu, then click the **Users** tab.
- [ ] **2.** Click **Add user**.
- [ ] **3.** Enter the coach's **email address**.
- [ ] **4.** Enter a **temporary password** of at least 6 characters, ideally longer.
- [ ] **5.** Click **Add user**.
- [ ] **6.** Repeat for each coach, including yourself if you'll be scoring.

**What you should see:** each coach in a table with columns including **Identifier** (their email) and **User UID**.

### 6b. Copy each coach's User UID

**Why:** The **User UID** is a long code Firebase gives each account, something like `kX9fP2mQ7rT4vW1yZ3aB5cD8eF0g`. The coaches list identifies coaches by this code rather than by email.

- [ ] **1.** In the **Users** table, hover over a coach's **User UID**. A small **copy icon** appears; click it.
- [ ] **2.** Paste it into your notepad next to the coach's name.
- [ ] **3.** Do this for every coach.

### 6c. Create the coaches list

- [ ] **1.** Go to **Firestore Database** → **Data** tab.
- [ ] **2.** Click **+ Start collection**.
  - A "collection" is like a folder in the database.
- [ ] **3.** **Collection ID:** type `admins`, all lower case and spelled exactly like that. Click **Next**.
- [ ] **4.** **Document ID:** paste the first coach's **User UID**.
  - **Do not** click "Auto-ID". It must be the coach's UID.
- [ ] **5.** Fill in a field so you know who this is:
  - **Field:** type `name`
  - **Type:** leave it as `string`
  - **Value:** type the coach's name, e.g. `Mary Doyle`
- [ ] **6.** Click **Save**.
- [ ] **7.** For each other coach: click **admins** in the left column, then **+ Add document**, and repeat steps 4–6.

**What you should see:** a collection called `admins` containing one document per coach, each named with a long UID.

### 6d. Tell the coaches

Send each coach, ideally in a private message rather than a group chat:

- the website address (you'll have it after Step 7),
- their email and temporary password,
- a note to change their password: on the sign-in screen, tap **Forgot password?**. This sends them an email with a link to choose a new one.

> Reset emails come from an address ending `@<your-project>.firebaseapp.com` and sometimes land in the **spam** folder.

---

## Step 7: Put the files on GitHub

**Why:** GitHub Pages is where the app lives. You'll replace the old single-file tracker with the new set of files.

### 7a. Find your repository

- [ ] **1.** Go to **https://github.com** and sign in.
- [ ] **2.** Click your profile picture (top right) → **Your repositories**.
- [ ] **3.** Click the repository that holds `GRFC_U14_rugby_tracker.html`.
- [ ] **4.** Note **which folder** that file is in:
  - Most often it's at the **top level**: you see it as soon as you open the repository.
  - Sometimes it's inside a folder called `docs`.
  - The new files must go **in the same place**.

### 7b. Upload the new files

- [ ] **1.** On the repository page (inside `docs` if that's where the old file was), click **Add file** → **Upload files**.
- [ ] **2.** On your computer, open the unzipped folder and select **everything inside it**: all files *and* folders (**Ctrl+A** or **Cmd+A**).
- [ ] **3.** Drag them onto the GitHub page where it says "Drag files here".
  - **Drag the contents, not the folder itself.** If you drag the outer folder, everything ends up one level too deep and the site won't load.
  - **Don't upload the zip file.** GitHub won't unpack it.
- [ ] **4.** Wait until every file is listed. There are about 22 files.
- [ ] **5.** Scroll down. In the box under **Commit changes**, type a short note such as `New tracker with live scores`.
- [ ] **6.** Make sure **Commit directly to the main branch** is selected.
- [ ] **7.** Click **Commit changes**.

**What you should see:** your repository listing `index.html`, `README.md`, `SETUP.md`, `firestore.rules` and the folders `css`, `data`, `fonts`, `js`, `vendor`. The old `GRFC_U14_rugby_tracker.html` has been replaced by the new small redirect file of the same name.

### 7c. Check GitHub Pages is switched on

You already host the tracker on GitHub Pages, so this is probably set already. It's worth checking.

- [ ] **1.** In the repository, click **Settings** (the tab with a gear icon, top right of the repository).
- [ ] **2.** In the left menu, click **Pages**.
- [ ] **3.** Under **Build and deployment**, check:
  - **Source** is **Deploy from a branch**.
  - **Branch** is **main** (sometimes `master`), and the folder is **/ (root)**, or **/docs** if your files are in `docs`.
  - If you changed anything, click **Save**.
- [ ] **4.** Near the top, GitHub shows **"Your site is live at https://…"**. Copy that address into your notepad. It looks like `https://yourname.github.io/your-repo-name/`. This is **your tracker's address**.

> **Why is my code public?** On a free GitHub account, Pages sites come from public repositories. That's fine: there are no secrets or personal data in these files. Player details only ever live on coaches' phones.

---

## Step 8: Add your settings to the website

**Why:** Right now the app doesn't know which Firebase project is yours. Until you do this step, the site shows the message "Live scores are not switched on yet".

You can edit the file directly on GitHub; no extra software is needed.

- [ ] **1.** In your repository, click the **js** folder, then **firebase-config.js**.
- [ ] **2.** Click the **pencil icon ✏** (top right of the file) to edit.
- [ ] **3.** You'll see:

  ```js
  export const firebaseConfig = {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME.firebaseapp.com",
    projectId: "REPLACE_ME",
    appId: "REPLACE_ME"
  };
  ```

- [ ] **4.** Replace each `REPLACE_ME` with the matching value from your notepad (Step 3). It should end up looking like this, with your own values:

  ```js
  export const firebaseConfig = {
    apiKey: "AIzaSyB1a2b3c4d5e6f7g8h9i0jKlMnOpQrStUv",
    authDomain: "greystones-u14.firebaseapp.com",
    projectId: "greystones-u14",
    appId: "1:123456789012:web:abc123def456"
  };
  ```

  **Rules for editing:**
  - **Keep the quote marks** `"` around each value.
  - **Keep the comma** at the end of each line, except the `appId` line.
  - For `authDomain`, replace the **whole** line's value, including `.firebaseapp.com`, with what Firebase gave you.
  - Leave the lines starting with `//` alone. They're notes for humans, ignored by the app.
- [ ] **5.** Click **Commit changes…**, then **Commit changes** again.

**What happens next:** GitHub takes **one to three minutes** to update the live site. You can watch progress on the repository's **Actions** tab; a green tick means it's done.

---

## Step 9: Tell Firebase your website's address

**Why:** Firebase only allows sign-in from websites you've approved. This adds your GitHub Pages address to that list.

- [ ] **1.** In Firebase, go to **Authentication** → **Settings** tab → **Authorized domains**.
- [ ] **2.** Click **Add domain**.
- [ ] **3.** Type just the domain part of your tracker's address:
  - Type `yourname.github.io`.
  - **Don't include** `https://`.
  - **Don't include** anything after `.io`, such as the repository name.
- [ ] **4.** Click **Add**.

---

## Step 10: Test everything

Do this at home before the first match. You'll need your computer and a phone. Ideally, also borrow a second phone.

### Test 1: The parent view works

- [ ] **1.** On your phone, open your tracker's address.
- [ ] **2.** Check you see three tabs: **Live**, **Results** and **League**.
- [ ] **3.** Check there's **no** red message saying "Live scores are not switched on yet".
  - If there is, Step 8 hasn't taken effect. Wait two minutes, then pull down to refresh. If it's still there, re-check Step 8.
- [ ] **4.** The Live tab should say "No match in progress for this squad".

### Test 2: A coach can sign in

- [ ] **1.** Scroll to the bottom of the page and tap **Coach sign-in**.
- [ ] **2.** Enter a coach email and password from Step 6.
- [ ] **3.** You should now see six tabs: **Game**, **Score**, **Sheet**, **Live**, **Results** and **League**.
  - If you see "this account is not on the coaches list", the coach's UID in Step 6c doesn't match. Re-check it carefully.

### Test 3: A score reaches parents

- [ ] **1.** On the coach phone: on the **Game** tab, pick any fixture, then tap **Go to scoring**.
- [ ] **2.** Tap **Start**, then tap **Try** for the home team.
- [ ] **3.** On the second phone (or a private/incognito window on your computer), open the tracker's address. The **Live** tab should show the try within a couple of seconds.
- [ ] **4.** Under the tabs on the coach phone, the line should say **All changes saved**.

### Test 4: The team sheet locks

- [ ] **1.** On the coach phone, open the **Sheet** tab.
- [ ] **2.** Choose a passphrase (at least 8 characters; a short phrase like `blue scrum cap` is easy to remember), type it twice, and tap **Set passphrase and open**.
- [ ] **3.** Type a made-up name in one player row.
- [ ] **4.** Tap **Lock now**, then try to unlock with a **wrong** passphrase. It should refuse.
- [ ] **5.** Unlock with the right passphrase. The name should still be there.
- [ ] **6.** Tap **Erase sheet** to remove the test name.

### Test 5: Offline scoring

- [ ] **1.** On the coach phone, turn on **Airplane mode**.
- [ ] **2.** Tap **Penalty**. The line under the tabs should say **Offline**.
- [ ] **3.** Turn Airplane mode off. Within a few seconds it should say **All changes saved**, and the other phone should show the penalty.

### Clean up

- [ ] **1.** On the **Score** tab, tap **New match** and confirm. This clears your test match for everyone.
- [ ] **2.** If the test reached full time, the test result will be in **Results**. To remove it, go back to **Score**, tap **Undo last** once (this removes "Full time" and the saved result), then tap **New match**.

**You're done!** Share the tracker's address with the coaches. Then share the live-score link with parents: use the **Share live link** button on the Live tab, which picks the right squad automatically.

---

## Optional extra security

### Lock your Firebase key to your website

**Why:** This stops anyone else's website from using your Firebase settings. It's like telling the scoreboard to accept messages only from your own app. It's optional; your data is already protected by the rules.

- [ ] **1.** Go to **https://console.cloud.google.com** and sign in with the same Google account.
- [ ] **2.** At the top of the page, click the **project picker** and select your Firebase project (same name).
- [ ] **3.** Open the menu **☰** → **APIs & Services** → **Credentials**.
- [ ] **4.** Under **API Keys**, click **Browser key (auto created by Firebase)**.
- [ ] **5.** Under **Application restrictions**, choose **Websites**.
- [ ] **6.** Click **Add**, type `https://yourname.github.io/*` (with your own GitHub name), and click **Done**.
- [ ] **7.** Click **Save**.
- [ ] **8.** Wait five minutes, then repeat Test 1 and Test 2 to make sure everything still works.
  - If it doesn't, come back and check the address. It must start `https://` and end with `/*`.

---

## Using it on matchday

### Before you leave home

- [ ] **Sign in on wifi.** You stay signed in, so you won't need signal at the pitch to start.
- [ ] **Check the squad** at the top of the Game tab. Tap the other squad to switch if needed.
- [ ] **Pick the fixture** on the **Game** tab. Teams, venue, date and kick-off fill in automatically.
- [ ] **Check the half length and sin-bin length.**
- [ ] **Share the live link** with parents (Live tab → **Share live link**).

### During the match

| To do this | Tap |
|---|---|
| Start, pause or resume the clock | **Start**, **Pause** or **Resume** |
| Record a try | **Try**. A bar appears asking about the conversion: tap **Good +2** or **Missed**. You can also choose the scorer's shirt number. |
| Record a penalty try | **Penalty try**. It's worth 7 points, with no conversion. |
| Record a yellow card | **Yellow card**. A sin-bin countdown appears on your screen and parents' screens. It only counts down while the clock is running. |
| Fix a mistake | **Undo last**. This removes the most recent event. If you undo a conversion, the conversion question comes back. |
| Half time | **Half time**. The clock jumps to the end of the first half, ready for the second. |
| End the match | **Full time**. The result is saved to the **Results** tab. |

**Shirt numbers and privacy:** parents see "Try #11". Your phone shows the player's name too, but only while your team sheet is unlocked. Names are never sent anywhere.

**One phone per squad:** if two coaches score the same squad at the same time, whichever change is made last wins. Agree who's scoring before kick-off.

### The team sheet

1. On the **Sheet** tab, unlock with your passphrase.
2. Fill in the players, either by:
   - typing them in, or
   - copying the team sheet text from the IRFU website and pasting it into the box, then tapping **Import pasted text**.
3. Always check the imported names, IDs and dates of birth against the original.
4. Collect the three signatures with a finger on the signature boxes.
5. Tap **Save team sheet as PDF**.

> **The PDF contains player details without protection.** Share it only with the people who need it (such as the referee or the branch), and delete it from your phone afterwards.

**When the sheet locks itself:**

- when you sign out,
- when you close the page,
- when the page has been in the background for 15 minutes.

**When it's erased automatically:** if it's not opened for 14 days. You can change this to anything from 1 to 30 days in the **Privacy on this device** box.

**If a phone is lost:**

- The team sheet on it is unreadable without the passphrase, and will erase itself after 14 days.
- To stop that phone being used to score, go to **Firebase → Authentication → Users**, find the coach, click the **⋮** menu, and choose **Disable account**. The coach can then be given a new password.

---

## Looking after it during the season

### Updating fixtures and league tables

All fixtures and tables live in one file: `data/fixtures.json`. You can edit it on GitHub, just like Step 8.

1. In your repository, open **data** → **fixtures.json** → click the **pencil ✏**.
2. Make your change, following the patterns below.
3. Click **Commit changes**. The site updates in one to three minutes.

**What a fixture line looks like:**

```json
{"date": "2026-11-20", "time": "", "home": "Greystones RFC", "away": "Lansdowne FC", "score": "", "venue": "Greystones", "note": ""},
```

| Part | What to put |
|---|---|
| `"date"` | Year-month-day, e.g. `"2026-11-20"` for 20 November 2026 |
| `"time"` | Kick-off as 24-hour time, e.g. `"11:00"`, or `""` (empty quotes) if not known yet. The app shows "TBC". |
| `"home"`, `"away"` | Team names, exactly as you want them shown |
| `"score"` | Leave as `""` until played, then fill in like `"24-12"` (home score first) |
| `"venue"` | Where it's played |
| `"note"` | Usually `""`. For a walkover, e.g. `"Conceded by Monkstown FC"`. |

**What a league table line looks like** (P = played, W = won, D = drawn, L = lost, pts = points):

```json
{"team": "Greystones RFC", "p": 4, "w": 4, "d": 0, "l": 0, "pts": 16},
```

Keep the table lines in league position order. Numbers don't have quote marks.

**Also update the "last updated" date**, near the top of each squad's section:

```json
"asOf": "22 Nov 2026",
```

**The three rules that prevent mistakes:**

1. **Every line in a list ends with a comma, except the last one** in that list.
2. **Text goes in straight double quotes** `"like this"`, never curly quotes “like this”. Curly quotes often appear if you copy from Word or WhatsApp.
3. **Don't delete** any `{ } [ ]` brackets.

**Check your work before committing:** copy the whole file, paste it into **https://jsonlint.com**, and click **Validate JSON**.

- If it says "Valid JSON", you're good.
- If not, it shows which line has the problem, usually a missing or extra comma.

If you do commit a mistake, the app still works, but shows "Fixtures could not be loaded" until it's fixed. Live scores are not affected.

### Adding or removing a coach

- **To add a coach:** repeat Step 6a (create account), 6b (copy UID) and 6c step 7 (add to `admins`).
- **To remove a coach:**
  1. In **Firestore Database → Data → admins**, click their document, then the **⋮** menu → **Delete document**.
  2. Then, in **Authentication → Users**, disable or delete their account.

### Starting a new season

1. Update `data/fixtures.json` with the new fixtures, tables and squad names.
2. Results from the previous season stay in the **Results** tab until you delete them. To clear them: in **Firestore Database → Data**, click the `results` collection, then the **⋮** menu → **Delete collection**.

---

## If something goes wrong

| What you see | What it means | How to fix it |
|---|---|---|
| "Live scores are not switched on yet" | The app can't find your Firebase settings. | Check Step 8: no `REPLACE_ME` left, quotes and commas intact. Wait two minutes after committing, then refresh. |
| A blank page, or just "Loading…" | Usually a typo in `firebase-config.js`, such as a missing quote or comma. | Compare your file carefully with the example in Step 8, character by character. |
| "This account is not on the coaches list" | The sign-in worked, but the account isn't in `admins`. | In Step 6c, the **Document ID** must be the coach's **User UID** exactly, and the collection must be named `admins`. |
| "That email and password do not match a coach account" | Wrong details, or the account doesn't exist. | Check **Authentication → Users**. Use **Forgot password?** to reset. |
| "The last change was refused by the server" | The database rejected a change. | Re-do Step 5b (paste and **Publish** the rules again), and check the coach is in `admins`. |
| Parents don't see updates | The coach's phone has no signal, or the parent's page is stale. | Look at the coach's status line (Offline / Saving / All changes saved). Ask parents to refresh. |
| Sign-in fails after the optional security step | The website restriction doesn't match your address. | Check it's exactly `https://yourname.github.io/*`. |
| "Fixtures could not be loaded" | A typo in `data/fixtures.json`. | Paste it into jsonlint.com to find the line, and fix it. |
| No password reset email | It's probably in spam. | Check the spam folder for an email from `…firebaseapp.com`. |
| Forgot the team sheet passphrase | By design, it can't be recovered. | Tap **Forgot passphrase – erase sheet from this device**, then set a new one and re-enter or paste the sheet. |
| The old link still shows the old tracker | Your phone has saved an old copy. | Refresh the page. The old address now sends people to the new app. |
| A notice about "data saved by the old version" | The phone used the old tracker, which kept player details unprotected. | Coaches: open the Sheet tab and set a passphrase to move them into protection. Anyone else: tap **Delete old data now**. |

---

## Glossary

| Term | Meaning |
|---|---|
| **API key** | A label that tells the app which Firebase project to talk to. Not a secret, not a password. |
| **Authentication** | The Firebase service that checks who someone is when they sign in. |
| **Collection** | A folder in the Firestore database (e.g. `admins`, `matches`, `results`). |
| **Commit** | GitHub's word for "save a change". |
| **Document** | One record inside a collection, e.g. one coach in `admins`, or one squad's live match in `matches`. |
| **Domain** | The main part of a web address, e.g. `yourname.github.io`. |
| **Encryption** | Scrambling data so it can only be read with the right passphrase. |
| **Firebase** | Google's service that provides the login system and database. |
| **Firestore** | The database part of Firebase. |
| **GitHub Pages** | GitHub's free service that turns files in a repository into a website. |
| **JSON** | The simple text format used by `fixtures.json`. |
| **Repository (repo)** | A project folder on GitHub. |
| **Security rules** | The rulebook Firebase enforces on its servers about who can read and change data. |
| **UID** | The unique code Firebase gives each user account. |

---

## Appendix: for the curious

You don't need anything below to run the tracker.

### Trying the app on your computer before publishing

If you have Python installed (it comes with most Macs), you can run the app on your computer:

1. Open **Terminal** (Mac) or **Command Prompt** (Windows) in the unzipped folder.
2. Type `python3 -m http.server 8000` and press Enter.
3. Open **http://localhost:8000** in your browser.

Before Firebase is connected, this runs in **preview mode**: any email signs you in, and data stays in that browser. Open a second tab on the Live view to watch it update as you score. Preview mode only switches on at `localhost`; it never runs on the real website.

Double-clicking `index.html` won't work. Browsers block apps opened straight from files for security reasons.

### What's stored where

| Information | Where it's kept | Who can see it |
|---|---|---|
| Team names, score, clock, match log (shirt numbers only) | Firebase database | Anyone with the link |
| Finished results | Firebase database | Anyone with the link |
| Coach email addresses | Firebase Authentication | Only people who manage the Firebase project |
| Player and official names, dates of birth, IRFU IDs, schools, signatures | Only on the coach's phone, encrypted | Only someone who knows that phone's passphrase |
| Saved team-sheet PDFs | Wherever the coach saves them | Whoever the coach shares them with |

It's good practice to tell parents that the live score page exists, and that it shows no player names.

### Security measures built in

- **Only the site's own files.** The site loads nothing from other websites. A setting in `index.html` (a "Content Security Policy") blocks any outside code from running.
- **No code from data.** Everything shown on screen is treated as plain text. Even if someone managed to put strange content into the database, it can't run as code on anyone's phone.
- **Server-side checks.** Firebase checks every change on Google's servers against `firestore.rules`.
- **Strong encryption.** Team sheets use AES-256, with the key made from the passphrase using 600,000 rounds of processing. That makes guessing passphrases very slow.

### Updating the built-in tools (for someone technical)

`vendor/firebase.js` is Firebase version 13.3.0, and `vendor/jspdf.umd.min.js` is jsPDF version 4.2.1. Updates aren't urgent, but a technical volunteer can refresh them once a season.

1. In an empty folder, run:

   ```
   npm install firebase jspdf esbuild
   ```

2. Create a file `fb-entry.js` that re-exports the functions listed at the top of `js/store.js`.
3. Run:

   ```
   npx esbuild fb-entry.js --bundle --format=esm --minify --outfile=vendor/firebase.js
   ```

4. Copy `node_modules/jspdf/dist/jspdf.umd.min.js` into `vendor/`.
5. Test using preview mode before uploading.
