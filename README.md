# Cinnamon

A calm companion app for older adults living alone. It gives medication reminders that follow real meal and sleep times, advice on going outside based on air quality, UV and heat, and a gentle morning check-in. The first user is Que, 68, in Hanoi. The app is iPhone-first and Vietnamese-first.

## What's in this first build

| Area | Status |
| --- | --- |
| Medication setup: photo → when → how many → read-back (on-device text recognition, spoken read-back) | Built |
| Meal-relative reminders ("Tôi đang ăn" / "Tôi ăn xong rồi"), grouped per moment; before- and after-meal pills never combined | Built |
| Local Time Sensitive notifications with Taken / Snooze / "Not eating yet" actions, repeats at 15 and 45 min, missed-dose alert to Que | Built |
| Outdoor brief: hourly AQI, UV and heat index, best time window, walking limit, heat plan that respects a fluid limit | Built |
| Morning sleep and energy check-in that adjusts the day; doctor suggestion after 5 hard days in 7 | Built |
| Refill reminder when about 5 days of pills remain | Built |
| Backup contact alerts and backup contact app | Not yet (needs a small server; rules are in `BackupAlertPolicy`) |
| On-device chat, cooking mode, message drafting | Not yet |
| Earlier-meals/bedtime nudges | Logic only (`RoutineCoach`); UI not yet |
| Nearby places, bus and Grab comparison | Not yet |

## Layout

```
CinnamonCore/     Pure-Swift package: the logic, with unit tests (runs on macOS and Linux)
  Sources/CinnamonCore/
    Medication.swift        Medicines, dose timing, quantities in half pills
    ReminderPlanner.swift   Turns meds + her rhythm + what she did today into grouped reminders
    DoseLog.swift           Taken / skipped / snoozed / missed, and backup-alert timing
    Outdoor.swift           Heat index, risk per hour, best window, walking limit
    AirSources.swift        Open-Meteo forecast and AirNow current AQI (worse value wins)
    CheckIn.swift           Morning check-in effects, fatigue monitor, routine targets
    LabelParser.swift       Guesses name and strength from recognised label text
    AppData.swift           Everything stored, as one JSON file on the phone
App/              SwiftUI iOS app (iOS 17+, runs on Que's iPhone 14)
project.yml       XcodeGen project spec
```

## Running it

You need a Mac with Xcode 16 or later.

```sh
brew install xcodegen
xcodegen generate
open Cinnamon.xcodeproj
```

Pick your team under Signing & Capabilities, then run it on an iPhone or the Simulator. Time Sensitive notifications need the "Time Sensitive Notifications" capability, which the generated entitlements already request.

Core tests:

```sh
cd CinnamonCore && swift test
```

CI (`.github/workflows/ci.yml`) runs the core tests and builds the app for the iOS Simulator on every push.

### Optional setup

- **Fonts:** the design uses Bricolage Grotesque (headings) and Be Vietnam Pro (text), both under the SIL Open Font License from Google Fonts. Add `BricolageGrotesque-Bold.ttf` and `BeVietnamPro-Regular.ttf` (plus other weights) to `App/Fonts/`, and list them under `UIAppFonts` in `project.yml`. Until you do, the app uses the system font.
- **AirNow:** get a free key at [docs.airnowapi.org](https://docs.airnowapi.org) and set `AirNowAPIKey` in `project.yml`. Without it, air quality comes from Open-Meteo only. We still need to confirm whether the AirNow lat/long endpoint covers the U.S. Embassy Hanoi monitor.

## Privacy

- Medication data, photos, her dose log and her home address stay on the phone.
- Weather and air requests send only a coordinate rounded to about 5 km, never her address.
- There are no accounts, analytics or ads.
