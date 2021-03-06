const { google } = require('googleapis');
const _ = require('lodash');
const { GOOGLE_OAUTH_CONFIG } = require('./environmentVariablesHelper.js')
const redirectPath = '/google/auth/callback';
const defaultScope = ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email', ' https://www.googleapis.com/auth/plus.login'];
const { getKeyCloakClient } = require('./keyCloakHelper')
const envHelper = require('./environmentVariablesHelper.js')
const request = require('request-promise'); //  'request' npm package with Promise support
const uuid = require('uuid/v1')
const dateFormat = require('dateformat')

let keycloak = getKeyCloakClient({
  resource: envHelper.KEYCLOAK_GOOGLE_CLIENT.clientId,
  bearerOnly: true,
  serverUrl: envHelper.PORTAL_AUTH_SERVER_URL,
  realm: envHelper.PORTAL_REALM,
  credentials: {
    secret: envHelper.KEYCLOAK_GOOGLE_CLIENT.secret
  }
})
class GoogleOauth {
  createConnection(req) {
    const  { clientId, clientSecret } = GOOGLE_OAUTH_CONFIG;
    const redirect = `${req.protocol}://${req.get('host')}${redirectPath}`;
    return new google.auth.OAuth2(clientId, clientSecret, redirect);
  }
  generateAuthUrl(req) {
    const connection = this.createConnection(req);
    return connection.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: defaultScope
    });
  }
  async getProfile(req) {
    const client = this.createConnection(req);
    if(req.query.error === 'access_denied'){
      throw new Error('GOOGLE_ACCESS_DENIED');
    }
    const { tokens } = await client.getToken(req.query.code).catch(this.handleError)
    client.setCredentials(tokens)
    const plus = google.plus({ version: 'v1', auth: client})
    const { data } = await plus.people.get({ userId: 'me' }).catch(this.handleError)
    return {
      name: data.displayName,
      emailId: _.get(_.find(data.emails, {type: 'account'}), 'value')
    }
  }
  handleError(error){
    if(_.get(error, 'response.data')){
      throw error.response.data
    } else if(error instanceof Error) {
      throw error.message
    } else {
      throw 'unhandled exception while getting tokens'
    } 
  }
}
const googleOauth = new GoogleOauth()
const createSession = async (emailId, req, res) => {
  const grant = await keycloak.grantManager.obtainDirectly(emailId);
  keycloak.storeGrant(grant, req, res)
  req.kauth.grant = grant
  keycloak.authenticated(req)
  return {
    access_token: grant.access_token.token,
    refresh_token: grant.refresh_token.token
  };
}
const fetchUserByEmailId = async (emailId, req) => {
  const options = {
    method: 'GET',
    url: envHelper.LEARNER_URL + 'user/v1/get/email/'+ emailId,
    headers: getHeaders(req),
    json: true
  }
  return request(options).then(data => {
    if (data.responseCode === 'OK') {
      return data;
    } else {
      throw new Error(_.get(data, 'params.errmsg') || _.get(data, 'params.err'));
    }
  })
}
const createUserWithMailId = async (accountDetails, req) => {
  if (!accountDetails.name || accountDetails.name === '') {
    throw new Error('USER_NAME_NOT_PRESENT');
  }
  const options = {
    method: 'POST',
    url: envHelper.LEARNER_URL + 'user/v2/create',
    headers: getHeaders(req),
    body: {
      request: {
        firstName: accountDetails.name,
        email: accountDetails.emailId,
        emailVerified: true
      }
    },
    json: true
  }
  return request(options).then(data => {
    if (data.responseCode === 'OK') {
      return data;
    } else {
      throw new Error(_.get(data, 'params.errmsg') || _.get(data, 'params.err'));
    }
  })
}
const getHeaders = (req) => {
  return {
    'x-device-id': req.get('x-device-id'),
    'x-msgid': uuid(),
    'ts': dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss:lo'),
    'content-type': 'application/json',
    'accept': 'application/json',
    'Authorization': 'Bearer ' + envHelper.PORTAL_API_AUTH_TOKEN
  }
}
module.exports = { googleOauth,  keycloak, createSession, fetchUserByEmailId, createUserWithMailId };