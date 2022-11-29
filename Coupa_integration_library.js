/*
 * Copyright (c) 2021. Coupa Software.
 */

/*******************************************************************************
 *
 * Name: Yogesh Jagdale
 *
 * Script Type: Custom Module Library
 *
 * Description: Custom Module for 1.0 Scripts to return Access Token for OpenIDConnect Client. Request for Bearer Token before making API call
 *
 ********************************************************************************/

/**
 * This function returns API header if clientURL, clientID & clientSecret for the OIDC connection are set by going to Setup > Company > General Preferences > Custom Preferences.
 * @param contentType
 * @param scope
 * @return {null|{Authorization: string, Accept: *|string}}
 */
function getAPIHeader(contentType, scope) {
    var context = nlapiGetContext();
    var clientURL = context.getSetting('SCRIPT', 'custscript_coupa_oidc_client_url');
    var clientID = context.getSetting('SCRIPT', 'custscript_coupa_oidc_client_id');
    var clientSecret = context.getSetting('SCRIPT', 'custscript_coupa_oidc_client_secret');
    // load the NetSuite configuration page
    var companyInfo = nlapiLoadConfiguration('companyinformation');
    //get field values
    var companyURL = companyInfo.getFieldValue('appurl');
    var preferenceURL = nlapiResolveURL('TASKLINK', 'ADMI_GENERAL');
    if (clientURL && clientID && clientSecret) {
        var accessToken = getBearerToken(clientURL, clientID, clientSecret, scope);
        if (accessToken) {
            contentType = contentType ? contentType : 'application/json';
            var header = {
                'Accept': contentType,
                'Authorization': "bearer " + accessToken
            }
        } else {
            nlapiLogExecution('AUDIT', 'DEPRECATION_WARNING', 'Coupa will eventually deprecate legacy API Keys and require the use of OpenID Connect (OIDC), first starting with new customer implementations, and eventually for all customers. This will be a gradual process and require you to upgrade your API integrations to OIDC. For more details refer https://success.coupa.com/Integrate/ERP_Playbooks');
            nlapiLogExecution('AUDIT', 'OpenID Connect (OIDC) Configuration Instructions', 'You can set the OIDC configuration parameters by going to Setup > Company > General Preferences > Custom Preferences or visit ' + companyURL + preferenceURL + '. These are Company level Parameters that will be available for all the Coupa Scripts.');
            return null;
        }
        return header;
    } else {
        nlapiLogExecution('AUDIT', 'DEPRECATION_WARNING', 'Coupa will eventually deprecate legacy API Keys and require the use of OpenID Connect (OIDC), first starting with new customer implementations, and eventually for all customers. This will be a gradual process and require you to upgrade your API integrations to OIDC. For more details refer https://success.coupa.com/Integrate/ERP_Playbooks');
        nlapiLogExecution('AUDIT', 'OpenID Connect (OIDC) Configuration Instructions', 'You can set the OIDC configuration parameters by going to Setup > Company > General Preferences > Custom Preferences or visit ' + companyURL + preferenceURL + '. These are Company level Parameters that will be available for all the Coupa Scripts.');
        return null;
    }
}

/**
 * Makes POST request to Coupa and returns Bearer Tokens to getAPIHeader
 * @param clientURL
 * @param clientID
 * @param clientSecret
 * @param scope
 * @return {null|String accessToken}
 */
function getBearerToken(clientURL, clientID, clientSecret, scope) {
    var bundleID = nlapiGetContext().getBundleId();
    var OIDC_SCOPES = "";
    switch (bundleID) {
        case '84306':
            //Scopes for P2P Bundle
            OIDC_SCOPES = "core.invoice.read core.invoice.write core.payables.invoice.read core.payables.invoice.write core.supplier.read core.supplier.write core.common.read core.common.write core.expense.read core.expense.write core.pay.payments.read core.pay.payments.write core.pay.virtual_cards.read core.pay.virtual_cards.write";
            break;
        case '72208':
            //Scopes for P2O Bundle
            OIDC_SCOPES = "core.pay.virtual_cards.read core.pay.virtual_cards.write core.purchase_order.read core.purchase_order.write core.inventory.receiving.read core.inventory.receiving.write core.supplier.read core.supplier.write core.common.read core.common.write";
            break;
        default:
            //Scopes for unbundled scripts(P2O & P2P)
            OIDC_SCOPES = "core.invoice.read core.invoice.write core.payables.invoice.read core.payables.invoice.write core.supplier.read core.supplier.write core.common.read core.common.write core.expense.read core.expense.write core.pay.payments.read core.pay.payments.write core.pay.virtual_cards.read core.pay.virtual_cards.write core.purchase_order.read core.purchase_order.write core.inventory.receiving.read core.inventory.receiving.write";
            break;
    }
    nlapiLogExecution("DEBUG", "Bundle ID: ", bundleID);

    try {
        if (clientURL && clientID && clientSecret) {
            scope = scope ? scope : OIDC_SCOPES;

            var data = {
                grant_type: 'client_credentials',
                client_id: clientID,
                client_secret: clientSecret,
                scope: scope
            };
            var headers = {'content-type': 'application/x-www-form-urlencoded'};
            var response = nlapiRequestURL(clientURL + '/oauth2/token', data, headers, null, 'POST');
            if (response && response.getCode() == 200) {
                nlapiLogExecution('DEBUG', "Successfully generated bearer token: response.code = ", response.getCode());
                response = JSON.parse(response.getBody());
                return response.access_token;
            } else {
                nlapiLogExecution('DEBUG', "Error while generating bearer token: ", JSON.stringify(response));
                nlapiLogExecution('ERROR', "Error while generating bearer token: ", response.getBody());
            }
        } else {
            nlapiLogExecution('DEBUG', 'Incorrect Parameters', 'Base URL: ' + clientURL + ' clientID: ' + clientID + ' clientSecret: ' + clientSecret + ' scope: ' + scope);
            return null;
        }
    } catch (e) {
        nlapiLogExecution('DEBUG', 'ERROR: ', JSON.stringify(e));
        nlapiLogExecution('ERROR', 'Error in getBearerToken()', JSON.stringify(e.message));
        return null;
    }
}