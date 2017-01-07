# AS-RansomewareRec
Recover from Google Drive ransomware (cryptolocker and variants. Encrypted Google Drive file recovery)

This apps script should be attached to a new Google Sheets document, under Advanced Services the Google Drive 2.0 API must be enabled, and the second line of the script should be modified to match the GMT time code for encrypted revisions.

Chron jobs every 5 min will function normally, but remember Google only allows 90min of scheduled tasks per day. For best results download TinyTask (http://portableapps.com/apps/utilities/tinytask_portable) and create a recording where you press the play button to start main() and wait 6min10sec and then end the recording with the hotkey. Put on continuous play and leave overnight on dedicated machine. 

May take many days to complete depending on size and depth (sub folder count) of structure. Remember you only have 30 days to recover before Google deletes revision history and you are screwed.

Please use and distribute at your own risk as governed by the GNU public use policies.
