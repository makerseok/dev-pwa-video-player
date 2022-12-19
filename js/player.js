const VIDEO_CACHE_NAME = 'site-video-v4';
const DEVICE_ID_AUTH = '5CAE46D0460AFC9035AFE9AE32CD146539EDF83B';

const setDeviceId = async deviceId => {
  const headers = {
    auth: DEVICE_ID_AUTH,
    device_id: deviceId,
  };

  try {
    const response = await axios.get(BASE_URL + DEVICE_URL, { headers });
    if (response.status === 200) {
      console.log(response);
      await db.deviceIds.clear();
      await db.deviceIds.add({
        deviceId: response.data.device_id,
        companyId: response.data.company_id,
      });
      player.deviceId = response.data.device_id;
      player.companyId = response.data.company_id;

      document.querySelector('#device-id').classList.remove('invalid');
      getApiResponses();
    }
  } catch (error) {
    document.querySelector('#device-id').classList.add('invalid');
  }
};

const deleteCachedVideo = async urls => {
  const cachedVideo = await caches.open(VIDEO_CACHE_NAME);
  const videoUrls = await cachedVideo.keys();

  videoUrls.forEach(async url => {
    // if (!urls.includes(url)) {
    await cachedVideo.delete(url);
    // }
  });
};

const fetchVideoAll = async urls => {
  const oldCachesCount = await db.caches
    .where('cachedOn')
    .between(
      getFormattedDate(new Date(new Date().toLocaleDateString())),
      getFormattedDate(
        addMinutes(new Date(new Date().toLocaleDateString()), 1440),
      ),
      false,
    )
    .and(item => item.deviceId === player.deviceId)
    .count();

  if (oldCachesCount === 0) {
    const videoCaches = await caches.open(VIDEO_CACHE_NAME);
    const keys = await videoCaches.keys();
    const cachedUrls = keys.map(e => e.url);

    const targetUrls = urls.filter(e => !cachedUrls.includes(e));
    const header = { destination: 'video' };
    const requests = targetUrls.map(url => axios.get(url), { header });
    console.log('fetching requests', requests);
    // await deleteCachedVideo(urls);
    try {
      const result = await Promise.allSettled(requests);
      console.log('allSettled result', result);
      // 실패한 것들만 필터링해서 다시 시도
      result.forEach(async (val, index) => {
        try {
          // 실패한 요청 다시 시도
          if (val.status === 'rejected') {
            console.log('fetching 재시도', targetUrls[index]);
            await requests[index];
          }
        } catch (error) {
          error => console.log('error on retry', error);
        }
      });
      const reportDB = await db.open();
      await reportDB.caches.add({
        cachedOn: getFormattedDate(new Date()),
        deviceId: player.deviceId,
      });
    } catch (error) {
      error => console.log(error);
    }
  }
};

const addMinutes = (date, min) => {
  const addedDate = new Date(date);
  addedDate.setMinutes(addedDate.getMinutes() + min);

  return addedDate;
};

const gethhMMss = date => {
  return date.toTimeString().split(' ')[0];
};

const sethhMMss = (date, hhMMss) => {
  const modifiedDate = new Date(date);
  const [hh, MM, ss] = hhMMss.split(':');
  modifiedDate.setHours(hh);
  modifiedDate.setMinutes(MM);
  modifiedDate.setSeconds(ss);
  return modifiedDate;
};

const getyymmdd = date => {
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1 < 9
      ? '0' + (date.getMonth() + 1)
      : date.getMonth() + 1
    ).toString() +
    (date.getDate() < 9 ? '0' + date.getDate() : date.getDate()).toString()
  );
};

const getFormattedDate = date => {
  const yymmdd = getyymmdd(date);
  const time = gethhMMss(date);

  return `${yymmdd} ${time}`;
};

const addHyphen = dateString => {
  const addedDateString = dateString.replace(
    /(\d{4})(\d{2})(\d{2})/g,
    '$1-$2-$3',
  );
  return addedDateString;
};

let player = videojs(document.querySelector('.video-js'), {
  inactivityTimeout: 0,
  muted: true,
  // autoplay: true,
  enableSourceset: true,
  controls: false,
  preload: 'none',
});

player.ready(async function () {
  console.log('player ready');

  const params = new URLSearchParams(location.search);

  const queryStringDeviceId = params.get('device_id');
  const queryStringCompanyId = params.get('company_id');

  if (queryStringDeviceId && queryStringCompanyId) {
    this.deviceId = queryStringDeviceId;
    this.companyId = queryStringCompanyId;
    getApiResponses();
  } else {
    const deviceIds = await db.deviceIds.toArray();
    if (deviceIds.length) {
      const deviceId = deviceIds[deviceIds.length - 1].deviceId;
      const companyId = deviceIds[deviceIds.length - 1].companyId;

      this.deviceId = deviceId;
      this.companyId = companyId;
      getApiResponses();
    } else {
      console.log('device id is not defined');
    }
  }

  this.jobs = [];
});

const isCached = async url => {
  const cachedVideo = await caches.open(VIDEO_CACHE_NAME);
  const cachedResponse = await cachedVideo.match(url);
  return cachedResponse;
};

player.on('loadeddata', async function () {
  const playlist = this.playlist();
  const currentIndex = this.playlist.currentIndex();
  const nextIndex = this.playlist.nextIndex();
  const previousIndex = this.playlist.previousIndex();

  try {
    if (playlist[nextIndex].isHivestack === 'Y') {
      const hivestackInfo = await getUrlFromHS(
        playlist[nextIndex].hivestackUrl,
      );
      console.log('hivestackInfo', hivestackInfo);
      if (hivestackInfo.success) {
        try {
          await axios.get(hivestackInfo.videoUrl);
          playlist[nextIndex].sources[0].src = hivestackInfo.videoUrl;
          playlist[nextIndex].reportUrl = hivestackInfo.reportUrl;
          playlist[nextIndex].report.HIVESTACK_URL = hivestackInfo.videoUrl;
        } catch (error) {
          console.log('error on fetching hivestack url');
        }
      }
    }
    if (playlist[previousIndex].isHivestack === 'Y') {
      playlist[previousIndex].sources[0].src = null;
      playlist[previousIndex].reportUrl = null;
      playlist[previousIndex].report.HIVESTACK_URL = null;
    }
  } catch (error) {
    console.log('Error on loadeddata > getUrlFromHS');
  }
  playlist[currentIndex].report.PLAY_ON = getFormattedDate(new Date());

  this.playlist(playlist, currentIndex);
});

player.on('play', () => {
  const date = new Date();
  if (date < player.runon || date > player.runoff) {
    player.pause();
  }
});

player.on('ended', async function () {
  const playlist = this.playlist();
  const currentIndex = this.playlist.currentIndex();
  const nextIndex = this.playlist.nextIndex();
  const currentItem = playlist[currentIndex];
  const playOn = currentItem.report.PLAY_ON;

  if (playlist[currentIndex].periodYn === 'N') {
    console.log('periodYn is N!');
    console.log('primary play list is', player.primaryPlaylist);
    player.playlist(player.primaryPlaylist);
    player.isPrimaryPlaylist = true;
    const lastPlayedIndex = await getLastPlayedIndex();
    await gotoPlayableVideo(player.primaryPlaylist, lastPlayedIndex);
  } else if (await isCached(playlist[nextIndex].sources[0].src)) {
    console.log('video is cached, index is', nextIndex);
    if (currentIndex === nextIndex) {
      player.play();
    }
    player.playlist.next();
  } else {
    console.log('video is not cached');
    await gotoPlayableVideo(playlist, currentIndex);
  }
  if (player.isPrimaryPlaylist) {
    storeLastPlayedVideo(currentIndex, playOn);
  }
  addReport(currentItem);
});

const storeLastPlayedVideo = async (videoIndex, PlayOn) => {
  const storedOn = getFormattedDate(new Date());
  await db.lastPlayed.put({
    deviceId: player.deviceId,
    videoIndex,
    PlayOn,
    storedOn,
  });
};

const getLastPlayedIndex = async () => {
  const index = await db.lastPlayed.get(player.deviceId);
  return index || 0;
};

const initPlayerPlaylist = (player, playlist, screen) => {
  console.log('initPlayerPlaylist');
  totalRT = playlist.map(v => {
    return parseInt(v.runningTime) * 1000;
  });
  player.screen = screen;
  player.primaryPlaylist = playlist;

  player.playlist(playlist);
  player.isPrimaryPlaylist = true;
  player.playlist.repeat(true);
  getLastPlayedIndex()
    .then(async lastPlayed => {
      console.log('######## last played index is', lastPlayed.videoIndex);
      await gotoPlayableVideo(playlist, lastPlayed.videoIndex || 0);
      if (player.paused()) {
        player.play();
      }
    })
    .catch(error => {
      console.log('Error on getLastPlayedIndex; set the index to 0');
    });
};

async function gotoPlayableVideo(playlist, currentIndex) {
  const distances = playlist.map((e, idx) => {
    return { distance: idx - currentIndex, idx: idx };
  });
  const sortedDistances = distances
    .filter(e => e.distance > 0)
    .concat(distances.filter(e => e.distance < 0));

  for (let i = 0; i < sortedDistances.length; i++) {
    if (await isCached(playlist[sortedDistances[i].idx].sources[0].src)) {
      player.playlist.currentItem(sortedDistances[i].idx);
      console.log('go to', sortedDistances[i].idx);
      break;
    }
  }
}

async function addReport(currentItem) {
  if (currentItem.reportUrl) {
    axios.get(currentItem.reportUrl).catch(error => {
      console.log(error);
    });
  }
  let report = currentItem.report;

  console.log('report', report);
  const reportDB = await db.open();
  if (report.PLAY_ON) {
    await reportDB.reports.add(report);
  }

  const oldDataCount = await db.reports
    .where('PLAY_ON')
    .below(getFormattedDate(addMinutes(new Date(), -5)))
    .count();

  if (oldDataCount > 0) {
    try {
      await reportAll();
    } catch (error) {
      console.log('Error on reportALL');
    }
  }
}

const reportAll = async () => {
  reports = await db.reports.toArray();
  const result = await postReport(reports);
  if (result.status === 200) {
    console.log('reports posted!', reports);
    M.toast({ html: 'reports posted!' });
    db.reports.clear();
  } else {
    console.log('report post failed!');
  }
};

function cronVideo(date, playlist) {
  if (playlist.length === 1 && playlist[0].isHivestack === 'Y') {
    const before2Min = addMinutes(date, -2);
    const job = Cron(
      before2Min,
      { maxRuns: 1, context: playlist },
      async (_self, context) => {
        const hivestackInfo = await getUrlFromHS(context[0].hivestackUrl);
        console.log('scheduled hivestackInfo', hivestackInfo);
        if (hivestackInfo.success) {
          try {
            await axios.get(hivestackInfo.videoUrl);
            context[0].sources[0].src = hivestackInfo.videoUrl;
            context[0].reportUrl = hivestackInfo.reportUrl;
            context[0].report.HIVESTACK_URL = hivestackInfo.videoUrl;
          } catch (error) {
            console.log('error on fetching hivestack url');
          }
          cronVideo(date, context);
        }
      },
    );
    player.jobs.push(job);
    console.log('scheduled on', before2Min);
  } else {
    const job = Cron(
      date,
      { maxRuns: 1, context: playlist },
      (_self, context) => {
        console.log('cron context', context);
        player.playlist(context);
        player.isPrimaryPlaylist = false;
        player.playlist.currentItem(0);
      },
    );
    player.jobs.push(job);
    console.log('scheduled on', date);
  }
}

const scheduleVideo = async (startDate, playlist, isPrimary = false) => {
  const hyphenStartDate = new Date(addHyphen(startDate));
  if (isPrimary) {
    cronVideo(hyphenStartDate, playlist);
  } else if (hyphenStartDate > new Date()) {
    const urls = playlist.map(v => v.sources[0].src).filter(src => src);

    const deduplicatedUrls = [...new Set(urls)];
    return Promise.all(
      deduplicatedUrls.map(url => axios.get(url, { mode: 'no-cors' })),
    ).then(() => {
      cronVideo(hyphenStartDate, playlist);
      return true;
    });
  }
};

const initialization = async () => {
  const reportDB = await db.open();
  await reportDB.delete();

  if (window.caches) {
    const keys = await caches.keys();
    keys.forEach(async cache => await caches.delete(cache));
  }
  const registration = await navigator.serviceWorker.getRegistration();
  await registration.unregister();

  window.location.reload();
};
