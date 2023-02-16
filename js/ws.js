const host = 'cs.raiid.ai';
const port = 9001;
let mqttRetryInterval = 1000;

let mqtt;

function onConnect() {
  console.log('connected!');
  let mainTopic = `/ad/${player.companyId}/${player.deviceId}/+`;
  mqtt.subscribe(mainTopic);
  console.log(mainTopic + ' subscribed!');
}

function onFailure() {
  console.log('Connection Failed!');
  setTimeout(() => {
    initWebsocket();
    mqttRetryInterval = Math.min(mqttRetryInterval * 2, 12000);
  }, mqttRetryInterval);
}

async function onMessageArrived(res) {
  const event = res.destinationName.replace(
    /\/ad\/[a-zA-Z0-9]*\/[a-zA-Z0-9]*\//,
    '',
  );
  const payload = JSON.parse(res.payloadString);
  const uuid = payload.UUID;
  const result = { event, uuid };

  const count = await db.websockets.where(result).count();
  console.log('event', event);
  console.log('payload', payload);
  console.log('count', count);
  if (count === 0) {
    try {
      await db.websockets.add(result);
      switch (event) {
        case 'ad':
          console.log('run ad!!');
          await initPlayerWithApiResponses(true);
          // console.log('run getEads!');
          // removeCeadJobs();
          // scheduleCeads(await getDataFromUrl(CEADS_URL));
          // console.log('run getPlayerUi!');
          setPlayerUi(await getDataFromUrl(DEVICE_URL));
          break;

        default:
          break;
      }
      await postWebsocketResult(result);
    } catch (error) {
      console.log('error on websocket', error);
    }
  }
}

const initWebsocket = () => {
  const options = {
    useSSL: true,
    timeout: 3,
    onSuccess: onConnect,
    onFailure: onFailure,
    userName: 'spacebank',
    password: 'demo00',
    reconnect: true,
    // reconnectInterval: 10,
  };
  const clientId = 'client-' + Math.random().toString().split('.')[1];

  mqtt = new Paho.MQTT.Client(host, port, clientId);

  mqtt.onMessageArrived = onMessageArrived;
  mqtt.connect(options);
};
