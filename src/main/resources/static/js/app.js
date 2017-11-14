function initNotifications(screenCaster) {

  if (!("Notification" in window)) {
    console.log("This browser does not support system notifications");
    screenCaster.notificationStatus.enabled = false;
    return;
  }

  if (Notification.permission === "granted") {
    screenCaster.notificationStatus.enabled = true;
    return;
  }

  if (Notification.permission !== 'denied') {
    Notification.requestPermission(function (permission) {
      if (permission === "granted") {
        screenCaster.notificationStatus.enabled = true;
      }
    });
  }
}

function initScreenVisibilityHandling() {

  var hiddenAttributeName, visibilityChangeEventName;
  if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
    hiddenAttributeName = "hidden";
    visibilityChangeEventName = "visibilitychange";
  } else if (typeof document.msHidden !== "undefined") {
    hiddenAttributeName = "msHidden";
    visibilityChangeEventName = "msvisibilitychange";
  } else if (typeof document.webkitHidden !== "undefined") {
    hiddenAttributeName = "webkitHidden";
    visibilityChangeEventName = "webkitvisibilitychange";
  } else {
    // step out, since some older browsers don't support handling of visibility changes.
    return;
  }

  function handleVisibilityChange() {

    if (document[hiddenAttributeName]) {
      document.title = "Paused...";
      console.log("stop updating");
      screenCaster.showUpdates = false;
    } else {
      document.title = "Active...";
      console.log("start updating");
      screenCaster.showUpdates = true;

      startScreenCast();
    }
  }

  document.addEventListener(visibilityChangeEventName, handleVisibilityChange, false);
}

function initResizeTools(screenCaster) {

  screenCaster.$screenImage.onclick = function () {
    $(this).toggleClass("screen-fit")
  };
}

function createScreenCaster() {
  return window.screenCaster = {
    enabled: true,
    showUpdates: true,
    notificationStatus: {
      enabled: false,
    },
    $screenImage: $("#screen")[0],
  };
}

function startScreenCast() {

  if ("URLSearchParams" in window) {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("screenUpdateInterval")) {
      screenUpdateInterval = parseInt(urlParams.get("screenUpdateInterval"), 10);
    }
  }

  if (!screenCaster.$screenImage) {
    return;
  }

  screenCaster.$screenImage.onload = function () {

    if (!screenCaster.enabled) {
      return;
    }

    setTimeout(refreshImage, screenUpdateInterval);
  };

  function refreshImage() {

    if (!screenCaster.showUpdates) {
      return;
    }

    console.log("screen update");

    screenCaster.$screenImage.src = "/screenshot.jpg?" + Date.now();
  }

  setTimeout(refreshImage, screenUpdateInterval);
}

var stompClient = null;
var screenUpdateInterval = 250;

function initWebSocketConnection() {
  var socket = new SockJS("/screencaster/ws");
  stompClient = Stomp.over(socket);
  stompClient.debug = null;
  stompClient.connect({}, function (frame) {
    console.log('Connected: ' + frame);

    stompClient.subscribe("/topic/notes", function (noteMessage) {
      onNoteEvent(JSON.parse(noteMessage.body));
    });

    stompClient.subscribe("/topic/settings", function (settingsMessage) {
      onSettingsEvent(JSON.parse(settingsMessage.body));
    });
  });
}

function onSettingsEvent(settingsEvent) {

  if (settingsEvent.type === "updated") {

    var enabledChanged = screenCaster.enabled !== settingsEvent.settings.castEnabled;
    screenCaster.enabled = settingsEvent.settings.castEnabled;

    if (screenCaster.enabled && enabledChanged) {
      startScreenCast();
    }

    $("#screenCastStatus").text(screenCaster.enabled ? "active" : "not active");
  }
}

function scrollToLatestNote() {
  var $notesListContainer = $("#notesListContainer");
  $notesListContainer.animate({scrollTop: $notesListContainer.prop("scrollHeight")}, 250);
}

function onNoteEvent(noteEvent) {

  if (noteEvent.type === "created") {

    addNote(noteEvent.note);

    scrollToLatestNote();

    if (screenCaster.notificationStatus.enabled) {

      var notification = new Notification("New notes", {
        body: "there are new notes available",
        icon: "/img/new-note-icon-128x128.png",
        timestamp: Date.now()
      });

      setTimeout(notification.close.bind(notification), 3000);
    }

  } else if (noteEvent.type === "deleted") {
    $("li[data-note-id='" + noteEvent.noteId + "']").remove();
  }

  updateUnreadNotesCount();
}

function addNote(note) {

  var template = $('#note-template').html();
  Mustache.parse(template);   // optional, speeds up future uses

  note.createdAtHuman = moment(note.createdAt).format("DD.MM.YY HH:mm:ss");

  var rendered = Mustache.render(template, note).trim();

  $("#notesList").append(rendered);
}

function updateUnreadNotesCount() {
  $("#unreadNotesCounter").text($(".note.new").length);
}

function updateNote(event) {

  event.preventDefault();

  var headers = {
    "X-CSRF-TOKEN": $("meta[name=csrf]").attr("value")
  };

  if (event.currentTarget.value === 'delete') {

    var noteUrl = $(event.target.form).attr("action");

    $.ajax({
      url: noteUrl,
      type: "delete",
      headers: headers
    }).done(function (response) {
      console.log("note deleted");
    });

    return;
  }

  if (event.currentTarget.value === 'deleteAll') {

    var proceed = window.confirm("Delete all notes?");

    if (!proceed) {
      return;
    }

    var noteUrl = "/notes";

    $.ajax({
      url: noteUrl,
      type: "delete",
      headers: headers
    }).done(function (response) {
      console.log("all notes deleted");

      $("li[data-note-id]").remove();
    });
  }
}

function markNoteAsRead(note) {

  var $note = $(note);
  $note.removeClass('new');
  $note.addClass('read');

  updateUnreadNotesCount();
}

function loadNotes() {

  $.getJSON("/notes", function (notes) {
    for (var i = 0; i < notes.length; i++) {
      addNote(notes[i]);
    }
  });
}

function initScreenCaster() {

  initWebSocketConnection();

  initScreenVisibilityHandling();

  var screenCaster = createScreenCaster();
  initNotifications(screenCaster);

  if (screenCaster.$screenImage) {
    initResizeTools(screenCaster);
    startScreenCast(screenCaster);
  }

  loadNotes();

  $("#notesForm").submit(function (event) {

    event.preventDefault();

    var $notesForm = $(this);

    $.ajax({
      url: $notesForm.attr("action"),
      type: $notesForm.attr("method"),
      data: $notesForm.serialize()
    }).done(function (response) { //
      // console.log(response);
    });

    $(this).get(0).reset();
  });
}

$(document).ready(initScreenCaster);