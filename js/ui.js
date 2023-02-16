const PAGE_SIZE = 10;
const deviceConfigMapping = {
  device_name: '디바이스명',
  location: '장소',
  remark: 'Remark',
  top: 'top',
  left: 'left',
  height: 'height',
  width: 'width',
  on: '시작시간',
  off: '종료시간',
};
let refreshTime;
const playerDOM = document.querySelector('#modal-player');

const resizeObserver = new ResizeObserver(entries => {
  for (let entry of entries) {
    const { width, height } = entry.contentRect;
    $('.video-js').width(width).height(height);
  }
});
resizeObserver.observe(playerDOM);

var intersectionObserver = new IntersectionObserver(function (entries) {
  console.log(entries[0]);
  if (entries[0].isIntersecting) {
    console.log('player is visible!');
    player.isVisible = true;
    player.play();
  } else {
    console.log('player is not visible!');
    player.isVisible = false;
    player.pause();
  }
});
intersectionObserver.observe(playerDOM);

document.addEventListener('DOMContentLoaded', function () {
  document.removeEventListener('DOMContentLoaded', arguments.callee, false);
  initTime();
});

/**
 * player가 잠금 상태가 아닐 경우 위치 및 크기 정보를 반올림한 값을 서버로 업로드
 * 업로드 성공 시 ui에 반영
 *
 * @param { Object } position player 위치 및 크기 정보
 */
const applyPosition = position => {
  if (player.locked) return;
  for (key in position) {
    position[key] = Math.round(position[key]);
  }
  player.position = position;
  postPlayerUi(position).then(() => {
    updateDevicePositionUi(position);
  });
};

async function initTime() {
  const date = new Date();
  $('#local-time').text(
    `${addHyphen(getFormattedDate(date))}.${String(
      date.getMilliseconds(),
    ).padStart(3, '0')}`,
  );
  clearInterval(refreshTime);
  refreshTime = setInterval(() => {
    updateTime(95);
  }, 95);
}

function updateTime() {
  const localDate = new Date();
  $('#local-time').text(
    `${addHyphen(getFormattedDate(localDate))}.${String(
      localDate.getMilliseconds(),
    ).padStart(3, '0')}`,
  );
}

/**
 * 입력받은 position 객체를 player DOM 요소에 적용
 *
 * @param { Object } position player 위치 및 크기 정보
 */
const initPlayerUi = position => {
  const { width, height, ...offset } = position;

  $(playerDOM)
    .offset(offset)
    .width(width)
    .height(height)
    .draggable({
      disabled: player.locked,
      cursor: 'crosshair',
      stop: function (event, ui) {
        const position = {
          width: ui.helper.width(),
          height: ui.helper.height(),
          top: Math.max(ui.offset.top, 0),
          left: Math.max(ui.offset.left, 0),
        };
        applyPosition(position);
      },
    })
    .resizable({
      disabled: player.locked,
      stop: function (event, ui) {
        const position = {
          ...ui.size,
          top: Math.max(ui.position.top, 0),
          left: Math.max(ui.position.left, 0),
        };
        applyPosition(position);
      },
    });
};

/**
 * 태그와 내부 텍스트가 있는 HTMLElement를 만듭니다.
 *
 * @param { string } tag - 생성하려는 HTMLElement의 태그 이름
 * @param { string } text - HTMLElement에 표시할 텍스트
 * @returns { HTMLElement } 태그와 텍스트가 설정된 HTMLElement
 */
const createElementWithInnerText = (tag, text) => {
  const element = document.createElement(tag);
  element.innerText = text;

  return element;
};

/**
 * 상위 노드에서 모든 하위 노드를 제거
 *
 * @param { HTMLElement } parent 상위 노드
 */
const removeAllChildNodes = parent => {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
};

/**
 * 입력받은 노드에 spinner를 표시하는 함수
 *
 * @param { HTMLElement } node spinner를 표시할 노드
 */
const displaySpinner = node => {
  node.innerHTML = `
    <td class="center" colspan="6">
      <div class="preloader-wrapper big active">
        <div class="spinner-layer">
          <div class="circle-clipper left">
            <div class="circle"></div>
          </div><div class="gap-patch">
            <div class="circle"></div>
          </div><div class="circle-clipper right">
            <div class="circle"></div>
          </div>
        </div>
      </div>
    </td>
  `;
};

/**
 * 입력받은 노드에 진행 상황을 표시하는 progress-spinner를 표시하는 함수
 *
 * @param { HTMLElement } node spinner를 표시할 노드
 */
const displaySpinnerWithPercent = node => {
  node.innerHTML = `
    <td class="center" colspan="6">
      <progress-spinner stroke="4" radius="60" progress="0"></progress-spinner>
    </td>
  `;
};

/**
 * 비디오 목록과 설정 정보에 spinner 표시
 */
const displaySpinnerOnTable = () => {
  const videoListNode = document.querySelector('#category-list');
  const deviceConfigNode = document.querySelector('#device-config');
  displaySpinnerWithPercent(videoListNode);
  displaySpinner(deviceConfigNode);
  showPlaylistOnly();
};

/**
 * 비디오 목록의 길이와 현재 페이지를 기반으로 pagination 생성
 *
 * @param { number } length 비디오 목록의 길이
 * @param { number } currentPage 현재 페이지 번호
 */
const createPagination = (length, currentPage) => {
  const videoPagination = document.querySelector('#video-pagination');
  const pages = parseInt(length / PAGE_SIZE);
  const leftArrowClass = currentPage === 1 ? 'disabled' : 'waves-effect';
  const rightArrowClass =
    currentPage === pages + 1 ? 'disabled' : 'waves-effect';
  const leftAnchorAttribute =
    currentPage === 1
      ? 'disabled'
      : `onclick="renderVideoList(player.videoList, ${currentPage - 1})"`;
  const rightAnchorAttribute =
    currentPage === pages + 1
      ? 'disabled'
      : `onclick="renderVideoList(player.videoList, ${currentPage + 1})"`;

  let paginationInnerHTML = `<li class="${leftArrowClass}"><a ${leftAnchorAttribute}><i class="material-icons">chevron_left</i></a></li>`;
  for (let i = 1; i <= pages + 1; i++) {
    const pageClass = currentPage === i ? 'active' : 'waves-effect';
    paginationInnerHTML += `<li id="page-${i}" class="${pageClass}"><a onclick="renderVideoList(player.videoList, ${i})">${i}</a></li>`;
  }
  paginationInnerHTML += `<li class="${rightArrowClass}"><a ${rightAnchorAttribute}><i class="material-icons">chevron_right</i></a></li>`;

  videoPagination.innerHTML = paginationInnerHTML;
};

/**
 * 비디오 목록과 현재 페이지 번호를 받아 해당 페이지의 비디오 목록 렌더링
 *
 * @param { Object[] } videoList 렌더링할 비디오 목록
 * @param { number } [currentPage=1] 현재 페이지 번호
 */
const renderVideoList = (videoList, currentPage = 1) => {
  const parentNode = document.querySelector('#video-body');
  removeAllChildNodes(parentNode);

  videoList
    .filter((row, index) => {
      const start = (currentPage - 1) * PAGE_SIZE;
      const end = currentPage * PAGE_SIZE;
      if (index >= start && index < end) return true;
    })
    .forEach(row => {
      const tr = document.createElement('tr');
      Object.values(row).forEach(value => {
        td = createElementWithInnerText('td', value);
        tr.appendChild(td);
      });
      parentNode.appendChild(tr);
    });
  createPagination(videoList.length, currentPage);
};

function renderCategoryList(crads) {
  const parentNode = document.querySelector('#category-list');
  removeAllChildNodes(parentNode);

  parentNode.appendChild(createCategoryList(crads));
}

function createCategoryList(crads) {
  const categoryListNode = document.createElement('ul');
  categoryListNode.className = 'collapsible';

  categoryListInnerHtml = '';
  categoryListInnerHtml += crads.items.reduce((acc, cur, idx) => {
    return (acc += `
      <li>
        <div class="collapsible-header" tabindex="0">
          <span class="category-index">${idx + 1}</span>
          <span class="category-name">${cur.CATEGORY_NAME}</span>
          <span class="badge">
            ${cur.START_DT.split(' ')[1]} ~ ${cur.END_DT.split(' ')[1]}
          </span>
        </div>
        <div class="collapsible-body" data-category-id=${cur.CATEGORY_ID}>
          <span>카테고리가 비어있습니다.</span>
        </div>
      </li>
    `);
  }, categoryListInnerHtml);
  categoryListNode.innerHTML = categoryListInnerHtml;
  M.Collapsible.init(categoryListNode);
  return categoryListNode;
}

function renderCategoryTree(crads) {
  $('.collapsible-body').each((idx, item) => {
    $(item).on('loaded.jstree', function () {
      categoryTreeTouchEvent(this);
    });
    $(item).on('before_open.jstree', function () {
      categoryNodeCancellation(this, crads);
    });
    const categoryId = $(item).data('category-id');
    const filteredCrads = crads.slots.filter(
      slot => slot.CATEGORY_ID === categoryId,
    )[0];

    if (filteredCrads) {
      const slots = filteredCrads.slots;

      const treeData = slots.reduce((acc, cur, idx) => {
        const parentNode = {
          id: cur.SLOT_ID,
          parent: '#',
          text: cur.SLOT_NAME,
        };

        const childNodes = cur.files.map(file => {
          return {
            id: `${file.SLOT_ID}-${file.RN}`,
            parent: file.SLOT_ID,
            text: file.D_FILE_NAME || file.TYP,
            icon: 'jstree-file',
          };
        });
        acc.push(parentNode, ...childNodes);
        return acc;
      }, []);

      $(item).jstree({
        core: {
          data: treeData,
          themes: {
            name: 'default-dark',
          },
        },
      });
    }
  });
}

function categoryTreeTouchEvent(root) {
  $(root)
    .find('.jstree-anchor[aria-level="1"]')
    .on('touchstart', event => {
      const parentNode = event.currentTarget.parentNode;
      const parentId = parentNode.getAttribute('id');
      const isOpened = parentNode.classList.contains('jstree-open');

      if (isOpened) {
        $(parentNode).jstree('close_node', parentId);
      } else {
        $(parentNode).jstree('open_node', parentId);
      }
    });
}

function categoryNodeCancellation(root, crads) {
  $(root)
    .find('.jstree-anchor[aria-level="2"]')
    .each((idx, item) => {
      const id = $(item).parent()[0].id;
      const [slotId, rn] = id.split('-');
      findData(crads.slots, 'RN', (key, value, obj) => {
        if (value == rn && obj.SLOT_ID == slotId && obj.HIVESTACK_YN === 'N') {
          isCached(obj.VIDEO_URL).then(result => {
            if (!result) {
              item.classList.add('cancellation');
              $(item).jstree().set_icon(item, 'jstree-none');
            }
          });
        }
      });
    });
}

/**
 * 디바이스 정보를 받아 설정 정보 UI 렌더링
 *
 * @param { Object } deviceConfig 디바이스 정보
 */
const setDeviceConfig = deviceConfig => {
  const parentNode = document.querySelector('#device-config');
  removeAllChildNodes(parentNode);

  for (const prop in deviceConfig) {
    const tr = document.createElement('tr');
    if (deviceConfigMapping[prop]) {
      const th = createElementWithInnerText('th', deviceConfigMapping[prop]);
      const td = createElementWithInnerText('td', deviceConfig[prop]);
      td.setAttribute('name', deviceConfigMapping[prop]);
      tr.appendChild(th);
      tr.appendChild(td);
      parentNode.appendChild(tr);
    }
  }

  const isLocked = deviceConfig['locked'] === 'Y' ? true : false;
  const lockPositionSwitch = createSwitchElement(isLocked);
  parentNode.appendChild(lockPositionSwitch);
};

/**
 * 설정 정보 UI를 입력받은 position 객체의 값으로 변경
 *
 * @param { Object } position
 */
const updateDevicePositionUi = position => {
  for (key in position) {
    document.querySelector(`td[name="${key}"]`).innerText = position[key];
  }
};

const disableDeviceIdButton = () => {
  const deviceIdButton = document.querySelector('#btn-device-id');
  deviceIdButton.setAttribute('disabled', '');
};

const enableDeviceIdButton = () => {
  const deviceIdButton = document.querySelector('#btn-device-id');
  deviceIdButton.removeAttribute('disabled');
};

function createSwitchElement(isLocked) {
  const lockPositionSwitch = document.createElement('div');
  lockPositionSwitch.classList.add('switch');
  lockPositionSwitch.id = 'lock-position';
  lockPositionSwitch.innerHTML = `<label>크기 & 위치 고정<input type="checkbox" /><span class="lever"></span></label>`;
  const lockPositionSwitchInput = lockPositionSwitch.querySelector('input');
  lockPositionSwitchInput.checked = isLocked;
  player.locked = isLocked;
  lockPositionSwitchInput.addEventListener('change', () =>
    applyLockPosition(lockPositionSwitchInput),
  );
  return lockPositionSwitch;
}

function applyLockPosition(lockPositionSwitchInput) {
  const isChecked = lockPositionSwitchInput.checked;
  postPositionLocked(isChecked)
    .then(() => {
      console.log('postPositionLocked');
      player.locked = isChecked;
      $(playerDOM).draggable(isChecked ? 'disable' : 'enable');
      $(playerDOM).resizable(isChecked ? 'disable' : 'enable');
    })
    .catch(error => {
      M.toast({ html: '크기 & 위치 고정 여부 연동 실패!', classes: 'red' });
    });
}

const showPlaylistOnly = () => {
  const videoInfo = document.querySelector('.video-info');
  const deviceInfo = document.querySelector('.device-info');

  videoInfo.classList.remove('mobile-hidden');
  deviceInfo.classList.add('mobile-hidden');
};

const showDeviceInfoOnly = () => {
  const videoInfo = document.querySelector('.video-info');
  const deviceInfo = document.querySelector('.device-info');

  videoInfo.classList.add('mobile-hidden');
  deviceInfo.classList.remove('mobile-hidden');
};

const showPlayerMobile = () => {
  playerDOM.classList.remove('mobile-hidden');
};

const hidePlayerMobile = () => {
  playerDOM.classList.add('mobile-hidden');
};

class ProgressSpinner extends HTMLElement {
  constructor() {
    super();
    const stroke = this.getAttribute('stroke');
    const radius = this.getAttribute('radius');
    const normalizedRadius = radius - stroke * 2;
    this._circumference = normalizedRadius * 2 * Math.PI;

    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `
      <div class="spinner-wrapper">
        <svg height="${radius * 2}" width="${radius * 2}">
          <circle
            stroke="#f5f5f5"
            stroke-dasharray="${this._circumference} ${this._circumference}"
            style="stroke-dashoffset:${this._circumference}"
            stroke-width="${stroke}"
            fill="transparent"
            r="${normalizedRadius}"
            cx="${radius}"
            cy="${radius}"
          />
        </svg>
        <strong class="value"></strong>
      </div>
      <style>
        circle {
          transition: stroke-dashoffset 0.35s;
          transform: rotate(-90deg);
          transform-origin: 50% 50%;
        }

        .value {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          top: 0;
          text-align: center;
          color: #f5f5f5;
          font-size: 16px;
          line-height: 120px;
        }
        .spinner-wrapper {
          position: relative;
          text-align: center;
        }
      </style>
    `;
  }

  setProgress(percent) {
    const offset = this._circumference - (percent / 100) * this._circumference;
    const circle = this._root.querySelector('circle');
    circle.style.strokeDashoffset = offset;

    const value = this._root.querySelector('.value');
    value.innerHTML = percent + '%';
  }

  static get observedAttributes() {
    return ['progress'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'progress') {
      this.setProgress(newValue);
    }
  }
}

window.customElements.define('progress-spinner', ProgressSpinner);
