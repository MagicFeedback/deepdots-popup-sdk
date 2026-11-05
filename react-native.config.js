// Autolinking de React Native: solo iOS lleva código nativo (ios/DeepdotsBackgroundTask.m).
// Android no suspende la app al pasar a background, así que no hace falta módulo.
module.exports = {
  dependency: {
    platforms: {
      android: null,
    },
  },
};
