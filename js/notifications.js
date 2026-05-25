/* ══════════════════════════════════════════════════════
   FocusBlock — notifications.js
   Browser notification permission and delivery.
   ══════════════════════════════════════════════════════ */

function requestNotifPerm(){
  if('Notification' in window && Notification.permission === 'default'){
    Notification.requestPermission();
  }
}

function sendNotif(title, body){
  if('Notification' in window && Notification.permission === 'granted'){
    try {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="%23c8f135"/></svg>',
        silent: false
      });
    } catch(e){}
  }
}
