const VIDEO_CACHE_NAME = 'site-video-v4';
const DEVICE_ID_AUTH = '3CAE46D0460AFC9035AFE9AE32CD146539EDF83B';

/**
 * 전달받은 deviceId 값이 유효할 경우 player 초기화
 *
 * @param { number } deviceId
 */
const setDeviceId = async deviceId => {
  const headers = {
    auth: DEVICE_ID_AUTH,
    device_id: deviceId,
  };

  try {
    const deviceData = await getDataFromUrl(DEVICE_URL, headers);
    if (deviceData.code === 'R001') {
      await db.deviceIds.clear();
      await db.deviceIds.add({
        deviceId: deviceData.device_id,
        companyId: deviceData.company_id,
      });
      player.deviceId = deviceData.device_id;
      player.companyId = deviceData.company_id;

      document.querySelector('#device-id').classList.remove('invalid');
      await initPlayerWithApiResponses();
    }
  } catch (error) {
    document.querySelector('#device-id').classList.add('invalid');
  }
};

/**
 * 전달받은 url 목록에 해당하는 캐시 삭제
 *
 * @param { string[] } urls 삭제 대상 url 목록
 */
const deleteCachedVideo = async urls => {
  const cachedVideo = await caches.open(VIDEO_CACHE_NAME);

  urls.forEach(async url => {
    await cachedVideo.delete(url);
  });
};

/**
 * 모든 비디오 URL을 가져와 캐시
 *
 * @param { string[] } urls 캐시할 URL 목록
 * @param { boolean } [sudo=false] true일 경우 이전 캐시 이력을 확인하지 않고 캐시
 */
const fetchVideoAll = async (urls, sudo = false) => {
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

  if (oldCachesCount === 0 || sudo) {
    const videoCaches = await caches.open(VIDEO_CACHE_NAME);
    const keys = await videoCaches.keys();
    const cachedUrls = keys.map(e => e.url);
    const targetUrls = urls.filter(e => !cachedUrls.includes(e));
    const total = targetUrls.length;

    console.log('number of fetching requests', total);

    try {
      if (!sudo) {
        displaySpinnerOnTable();
        disableDeviceIdButton();
      }
      for (const [index, url] of targetUrls.entries()) {
        try {
          if (!sudo) {
            const progressSpinner = document.querySelector('progress-spinner');
            progressSpinner.setProgress(parseInt((index / total) * 100));
          }
          await axios.get(url);
        } catch (error) {
          console.log('Error on fetching ' + url, error);
        }
      }

      const reportDB = await db.open();
      await reportDB.caches.add({
        cachedOn: getFormattedDate(new Date()),
        deviceId: player.deviceId,
      });
      enableDeviceIdButton();
    } catch (error) {
      console.log(error);
    }
  }
};

/**
 * Date 객체에 입력받은 만큼 분 추가
 *
 * @param { Date } date 분을 추가할 Date 객체
 * @param { number } min Date 객체에 추가할 분 수
 * @return { Date } 원래 Date 객체에 분을 추가한 새 Date 객체
 */
const addMinutes = (date, min) => {
  const addedDate = new Date(date);
  addedDate.setMinutes(addedDate.getMinutes() + min);

  return addedDate;
};

const addMilliseconds = (date, ms) => {
  return new Date(date.getTime() + ms);
};

/**
 * Date 객체를 입력받아 "hh:MM:ss" 형식의 문자열을 반환
 *
 * @param { Date } date Date 객체
 * @returns { string } "hh:MM:ss" 형식의 문자열
 */
const gethhMMss = date => {
  return date.toTimeString().split(' ')[0];
};

/**
 * Date 객체의 시간을 입력받은 "hh:MM:ss"로 변경한 새로운 객체 반환
 *
 * @param { Date } date 수정할 Date 객체
 * @param { string } hhMMss "hh:MM:ss" 형식의 문자열
 * @returns { Date } 수정된 Date 객체
 */
const sethhMMss = (date, hhMMss) => {
  const modifiedDate = new Date(date);
  const [hh, MM, ss] = hhMMss.split(':');
  modifiedDate.setHours(hh);
  modifiedDate.setMinutes(MM);
  modifiedDate.setSeconds(ss);
  return modifiedDate;
};

/**
 * "hh:MM:ss" 형식 문자열을 "ss MM hh * * *" 형식 문자열로 변환
 *
 * @param { string } hhMMss "hh:MM:ss" 형식 문자열
 * @returns { string } "ss MM hh * * *" 형식 문자열
 */
const hhMMssToCron = hhMMss => {
  const [hh, MM, ss] = hhMMss.split(':');

  return `${ss} ${MM} ${hh} * * *`;
};

/**
 * Date 객체를 사용하여 "yyyymmdd" 형식의 문자열을 반환
 *
 * @param { Date } date Date 객체
 * @returns { string } "yyyymmdd" 형식 문자열
 */
const getyymmdd = date => {
  function leftPad(value) {
    if (value >= 10) {
      return value.toString();
    }
    return `0${value}`;
  }
  const year = date.getFullYear();
  const month = leftPad(date.getMonth() + 1);
  const day = leftPad(date.getDate());
  return year + month + day;
};

/**
 * Date 객체를 입력받아 "yyyymmdd hh:MM:ss" 형식 문자열 반환
 *
 * @param { Date } date Date 객체
 * @returns { string } "yymmdd hh:MM:ss" 형식 문자열
 */
const getFormattedDate = date => {
  const yymmdd = getyymmdd(date);
  const time = gethhMMss(date);

  return `${yymmdd} ${time}`;
};

/**
 * 하이픈이 없는 "yyyymmdd" 형식의 문자열에 하이픈 추가
 *
 * @param { string } dateString "yyyymmdd" 형식 문자열
 * @returns { string } 하이픈이 추가된 "yyyy-mm-dd" 형식 문자열
 */
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
  loadingSpinner: false,
  errorDisplay: false,
});

player.ready(async function () {
  player.defaultJobs = [];
  player.cradJobs = [];
  player.ceadJobs = [];
  player.cpadJobs = [];
  player.playlistQueue = [];
  console.log('player ready');

  const params = new URLSearchParams(location.search);

  const queryStringDeviceId = params.get('device_id');
  const queryStringCompanyId = params.get('company_id');

  if (queryStringDeviceId && queryStringCompanyId) {
    this.deviceId = queryStringDeviceId;
    this.companyId = queryStringCompanyId;
    await initPlayerWithApiResponses();
  } else {
    const deviceIds = await db.deviceIds.toArray();
    if (deviceIds.length) {
      const deviceId = deviceIds[deviceIds.length - 1].deviceId;
      const companyId = deviceIds[deviceIds.length - 1].companyId;

      this.deviceId = deviceId;
      this.companyId = companyId;
      await initPlayerWithApiResponses();
    } else {
      console.log('device id is not defined');
    }
  }

  this.jobs = [];
});

player.on('enterFullWindow', async () => {
  player.isVisible = true;
  showPlayerMobile();
  await player.play();
});

player.on('exitFullWindow', () => {
  hidePlayerMobile();
  player.pause();
});

let latestTap;
let touchCount = 0;
player.on('touchstart', () => {
  const now = new Date().getTime();
  const timesince = now - latestTap;
  if (timesince < 400 && timesince > 0) {
    touchCount++;
    if (touchCount >= 2) {
      player.exitFullWindow();
    }
  } else {
    touchCount = 0;
  }
  latestTap = new Date().getTime();
});

/**
 * 해당 url의 캐시 여부 반환
 *
 * @param { string } url 캐시 여부를 확인할 url
 * @returns { Promise<Response | null> } 해당 url 캐시 여부
 */
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
    if (
      playlist[previousIndex].isHivestack === 'Y' &&
      previousIndex != nextIndex
    ) {
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

player.on('play', async () => {
  if (!(await isCached(player.src()))) {
    player.pause();
  }

  if (!player.isVisible) {
    player.pause();
  }

  const date = Math.floor(new Date().getTime() / 1000);
  if (date < player.runon || date > player.runoff || player.isEnd) {
    player.pause();
  }
});

player.on('seeking', () => {
  const playlist = player.playlist();
  const currentIndex = player.playlist.currentIndex();

  playlist[currentIndex].report.PLAY_ON = getFormattedDate(new Date());

  console.log(
    'PLAY_ON modified when seeking!',
    playlist[currentIndex].report.PLAY_ON,
  );
  player.playlist(playlist, currentIndex);
});

player.on('error', async () => {
  console.log('error!!!');
  await gotoPlayableVideo(player.playlist(), player.playlist.currentIndex());
});

player.on('ended', async function () {
  const playlist = this.playlist();
  const currentIndex = this.playlist.currentIndex();
  const nextIndex = this.playlist.nextIndex();
  const lastIndex = this.playlist.lastIndex();
  const currentItem = playlist[currentIndex];

  if (player.type === 'rad') {
    const videoInfo = {
      videoIndex: currentIndex,
      PlayOn: currentItem.report.PLAY_ON,
      categoryId: currentItem.categoryId,
      slotId: currentItem.slotId,
      fileId: currentItem.report.FILE_ID,
    };
    await storeLastPlayedVideo(videoInfo);
  }
  if (
    playlist[currentIndex].periodYn === 'N' &&
    currentIndex >= (await getPlayableVideo(playlist, currentIndex)) &&
    player.type !== 'rad'
  ) {
    console.log('periodYn is N!');
    const nextPlaylist = getNextPlaylist();
    console.log('next playlist is', nextPlaylist);
    player.type = nextPlaylist.type;
    player.playlist(nextPlaylist.playlist);
    const lastPlayed = await getLastPlayedIndex(nextPlaylist.playlist);
    await gotoPlayableVideo(nextPlaylist.playlist, lastPlayed);
  } else if (await isCached(playlist[nextIndex].sources[0].src)) {
    console.log('video is cached, index is', nextIndex);
    if (currentIndex === nextIndex) {
      await player.play();
    }
    player.playlist.next();
  } else {
    console.log('video is not cached');
    await gotoPlayableVideo(playlist, currentIndex);
  }
  addReport(currentItem);
});

/**
 * 마지막으로 재생된 비디오의 인덱스를 데이터베이스에 저장
 *
 * @param { Object } videoInfo - 비디오 정보
 */
const storeLastPlayedVideo = async videoInfo => {
  const storedOn = getFormattedDate(new Date());
  await db.lastPlayed.put({
    deviceId: player.deviceId,
    storedOn,
    ...videoInfo,
  });
};

/**
 * 데이터베이스에 저장되어있는 마지막으로 재생된 비디오 인덱스 반환
 *
 * @return { Promise<number> } 마지막으로 재생된 비디오 인덱스
 */
async function getLastPlayedIndex(playlists) {
  try {
    const lastPlayed = await db.lastPlayed.get(player.deviceId);
    if (!lastPlayed) {
      return 0;
    }
    const indexedPlaylist = playlists.map((element, idx) => {
      return { idx, ...element };
    });
    const categoryIdPlaylists = indexedPlaylist.filter((video, idx) => {
      return video.categoryId === lastPlayed.categoryId;
    });
    if (categoryIdPlaylists.length === 0) {
      return 0;
    }
    const slotIdPlaylists = categoryIdPlaylists.filter((video, idx) => {
      return video.slotId === lastPlayed.slotId;
    });
    if (slotIdPlaylists.length === 0) {
      return categoryIdPlaylists[0].idx;
    }
    const fileIdPlaylists = slotIdPlaylists.filter((video, idx) => {
      return (
        video.report.fileId === lastPlayed.fileId &&
        video.idx === lastPlayed.videoIndex
      );
    });
    if (fileIdPlaylists.length === 0) {
      return slotIdPlaylists[0].idx;
    }
    return fileIdPlaylists[0].idx;
  } catch (error) {
    console.log('Error on getLastPlayedIndex', error);
    return 0;
  }
}

// function compare

/**
 * player playlist 초기화
 *
 * @param { Object[] } playlist 재생목록
 * @param { string } screen device code
 */
const initPlayerPlaylist = (playlist, screen) => {
  console.log('initPlayerPlaylist');
  totalRT = playlist.map(v => {
    return parseInt(v.runningTime) * 1000;
  });
  player.screen = screen;
  player.radPlaylist = playlist;

  player.playlist(playlist);
  player.type = 'rad';
  player.playlist.repeat(true);
  getLastPlayedIndex(playlist)
    .then(async lastPlayed => {
      console.log('######## last played index is', lastPlayed);
      await gotoPlayableVideo(playlist, lastPlayed);
      if (player.paused()) {
        await player.play();
      }
    })
    .catch(error => {
      console.log('Error on getLastPlayedIndex', error);
      console.log('set the index to 0');
    });
};

/**
 * 가장 가까운 캐시되어있는 비디오 index 반환
 *
 * @param { Object[] } playlist 재생목록
 * @param { number } currentIndex 현재 index
 */
async function getPlayableVideo(playlist, currentIndex) {
  const distances = playlist.map((e, idx) => {
    return { distance: idx - currentIndex, idx: idx };
  });
  const sortedDistances = distances
    .filter(e => e.distance > 0)
    .concat(distances.filter(e => e.distance < 0));

  let success = false;
  for (let i = 0; i < sortedDistances.length; i++) {
    if (await isCached(playlist[sortedDistances[i].idx].sources[0].src)) {
      return sortedDistances[i].idx;
    }
  }
  if (!success) {
    return currentIndex;
  }
}

/**
 * 가장 가까운 캐시되어있는 비디오로 이동
 *
 * @param { Object[] } playlist 재생목록
 * @param { number } currentIndex 현재 index
 */
async function gotoPlayableVideo(playlist, currentIndex) {
  const targetIndex = await getPlayableVideo(playlist, currentIndex);
  player.playlist.currentItem(targetIndex);
  player.currentTime(0);
  console.log('go to', currentIndex);
  await player.play();
}

/**
 * hivestack 비디오일 경우 재생완료 post한 뒤 데이터베이스에 report 저장
 * 저장된지 5분 이상 경과된 report가 있을 경우 모든 report 서버로 전송
 *
 * @param { Object } currentItem playlist에서 재생 완료한 item
 */
async function addReport(currentItem) {
  if (currentItem.reportUrl) {
    axios.get(currentItem.reportUrl).catch(error => {
      console.log(error);
    });
    const cachedVideo = await caches.open(VIDEO_CACHE_NAME);
    await cachedVideo.delete(currentItem.sources[0].src);
    console.log('cache deleted', currentItem.sources[0].src);
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

/**
 * 데이터베이스에 존재하는 모든 report 서버로 post
 */
const reportAll = async () => {
  reports = await db.reports.toArray();
  const result = await postReport(reports);
  if (result.status === 200) {
    console.log('reports posted!', reports);
    M.toast({ html: 'reports posted!' });
    db.reports.clear();
  } else {
    console.log('report post failed!', result);
  }
};

function getNextPlaylist() {
  const queues = player.playlistQueue;
  const defaultPlaylist = { type: 'rad', playlist: player.radPlaylist };
  if (!queues.length) {
    return defaultPlaylist;
  }
  const padQueue = queues.filter(queue => queue.type === 'pad');
  if (padQueue.length) {
    return padQueue.shift();
  }
  const radQueue = queues.filter(queue => queue.type === 'rad');
  if (radQueue.length) {
    return radQueue.shift();
  }
  return defaultPlaylist;
}

/**
 * 해당하는 Date에 playlist 재생하도록 cron 등록
 * playlist에 있는 비디오가 hivestack 하나일 경우 재생 2분 전에 hivestack 광고 정보를 요청
 *
 * @param { Date } date 비디오를 재생할 날짜와 시간.
 * @param { Object } playlist 재생목록
 * @param { boolean } [isPrimary=false] true일 경우 startDate 상관없이 로직 진행
 * @return { Cron } Cron 객체
 */
function cronVideo(date, playlist, type) {
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
          cronVideo(date, context, type);
        }
      },
    );
    console.log('scheduled on', before2Min);
    return job;
  } else {
    const job = Cron(
      date,
      { maxRuns: 1, context: playlist },
      async (_self, context) => {
        console.log('cron context', context);
        console.log('schedule type', type);
        console.log('player type', player.type);
        console.log('player isEnd', player.isEnd);
        const queueItem = { type, playlist: context };
        if (type === 'ead') {
          player.playlist(context);
          player.isEnd = false;
          player.type = type;
          player.playlist.currentItem(0);
          player.currentTime(0);
        } else if (type === 'pad') {
          if (player.type === 'rad') {
            player.playlist(context);
            player.isEnd = false;
            player.type = type;
            player.playlist.currentItem(0);
            player.currentTime(0);
          }
        } else if (type === 'rad') {
          if (player.type === 'rad' || player.type === undefined) {
            player.playlist(context);
            player.isEnd = false;
            player.type = type;
            player.radPlaylist = context;
            const lastPlayed = await getLastPlayedIndex(context);
            await gotoPlayableVideo(context, lastPlayed);
          } else {
            player.playlistQueue.push(queueItem);
          }
        }
        // player.playlist(context);
        // player.isEnd = false;
        // if (isPrimary) {
        //   player.isPrimaryPlaylist = true;
        //   player.primaryPlaylist = context;
        //   const lastPlayed = await getLastPlayedIndex();
        //   await gotoPlayableVideo(
        //     player.primaryPlaylist,
        //     lastPlayed,
        //   );
        // } else {
        //   player.isPrimaryPlaylist = false;
        //   player.playlist.currentItem(0);
        //   player.currentTime(0);
        // }
      },
    );
    console.log('scheduled on', date, type);
    return job;
  }
}

/**
 * playlist에 있는 비디오들을 fetching한 뒤 fetching에 성공할 경우 해당 비디오 schedule
 * 성공 시 Cron 객체 반환
 *
 * @param { string } startDate schedule 기준 일자
 * @param { Object[] } playlist 재생목록
 * @param { boolean } [isPrimary=false] true일 경우 startDate 상관없이 로직 진행
 * @return { Promise<undefined | Cron> } schedule 성공 시 Cron 객체 반환
 */
const scheduleVideo = async (startDate, playlist, type) => {
  const hyphenStartDate = new Date(addHyphen(startDate));
  if (hyphenStartDate < new Date()) {
    return false;
  }
  const urls = playlist.map(v => v.sources[0].src).filter(src => src);

  const deduplicatedUrls = [...new Set(urls)];
  let cachedCount = 0;
  for (const [index, url] of deduplicatedUrls.entries()) {
    try {
      const response = await axios.get(url);
      if (response.status === 200) {
        cachedCount++;
      }
    } catch (error) {
      console.log('Error when fetching scheduled video', error);
    }
  }
  if (type !== 'rad' && !cachedCount) {
    return false;
  }
  return cronVideo(hyphenStartDate, playlist, type);
};

/**
 * service worker 및 storage 초기화
 */
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
