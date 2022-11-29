/**
 * Author:          Ravi Shankar
 * Version:         1
 * Date:            April 01, 2022
 * File Name:       Genesys GU SO Segment Price Validation.js
 * SuiteScript Ver: 2.0
 *
 * Description:    If created via UI (Manually) or CSV Import or Celigo SmartClient
Upon create and edit, before submit, if Journal Classification is set to a certain value, no line should have below three fields set to blank

Sold To Customer
End User Customer
RevPro RC Number

Error Message: 'for this Journal classification value, Sold To Customer, End User Customer, RevPro RC Number fields are Mandatory'
 * Notes:
 *
 * List of Required Netsuite Objects: 
 *      Transaction Body Field :  Journal Classification(custbody_genesys_je_classification)
 *      Transaction Line Fields :  Sold to Customer (custcol_customer) , End User Customer (custcol_end_user_customer), RevPro RC Number(custcol_revpro_rc_number)
 *
 */
/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope TargetAccount
 */
define(['N/runtime', 'N/record', 'N/search'],
    function(runtime, record, search) {
        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type
         * @param {Form} scriptContext.form - Current form
         * @Since 2015.2
         */
        function beforeLoad(scriptContext) {
            try {

            } catch (ex) {
                log.error(ex.name, ex.message);
            }
        }
        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type
         * @Since 2015.2
         */
        function beforeSubmit(scriptContext) {

            if (scriptContext.type == "create" || scriptContext.type == "edit") {
                var journalRec = scriptContext.newRecord;

                var errorExists = false;
                var errorMessage = "";

                var jeClassification = journalRec.getValue('custbody_genesys_je_classification');

                if (jeClassification == 85) { //Revenue (GARN)
                    var lineCount = journalRec.getLineCount({
                        sublistId: 'line'
                    });

                    for (var i = 0; i < lineCount; i++) {
                        var soldToCustomer = journalRec.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_customer',
                            line: i
                        });
                        var endUserCustomer = journalRec.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_end_user_customer',
                            line: i
                        });
                        var revProRcNo = journalRec.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_revpro_rc_number',
                            line: i
                        });
                        var missingFields = [];
                        if (soldToCustomer == '' || endUserCustomer == '' || revProRcNo == '') {
                            errorExists = true;
                        }
                        if (soldToCustomer == '') {
                            missingFields.push("Sold To Customer");
                        }
                        if (endUserCustomer == '') {
                            missingFields.push("End User Customer");
                        }
                        if (revProRcNo == '') {
                            missingFields.push("Rev Pro Rc Number");
                        }

                        if (missingFields.length > 0) {
                            errorMessage += "<br> "+ missingFields.toString() + " missing at line " + (i + 1);
                        }
                    }
                }

                if(errorExists){
                    throw new Error(errorMessage);
                }

                

                log.debug('errorMessage', errorMessage);
            }
        }
        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type
         * @Since 2015.2
         */
        function afterSubmit(scriptContext) {
            try {} catch (ex) {
                log.error(ex.name, ex.message);
            }
        }
        return {
            //beforeLoad: beforeLoad,
            beforeSubmit: beforeSubmit,
            // afterSubmit: afterSubmit
        };
    });