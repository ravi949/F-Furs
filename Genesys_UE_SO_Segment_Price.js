/**
 * Author:          Ravi Shankar
 * Version:         1
 * Date:            April 01, 2022
 * File Name:       Genesys GU SO Segment Price Validation.js
 * SuiteScript Ver: 2.0
 *
 * Description:     For GU Orders (Standalone GU checkbox checked), if created via UI (Manually) or CSV Import,
   user event, before submit, go to each line and check Segment Price field value, if value is not a number, throw error, do not let SO saved
   Error Message: 'for GU Sales Orders, Segment Price on all lines should have a numerical value
 * Notes:       
 *
 * List of Required Netsuite Objects: 
 *      Transaction Body Field :  STANDALONE GU(custbody_genesys_standalone_gu)
 *      Transaction Line Field :  Segment Price(custcol_segment_price)
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
            
                if(scriptContext.type == "create" || scriptContext.type == "edit"){
                    var salesOrderRec = scriptContext.newRecord;

                    var guSalesOrder = salesOrderRec.getValue('custbody_genesys_standalone_gu');

                    var errorMessage = "";
                    var errorExists = false;

                    if(guSalesOrder){
                        var itemLineCount = salesOrderRec.getLineCount({
                            sublistId : 'item'
                        });
                        //looping the items sublist.
                        for(var i = 0 ; i < itemLineCount ; i++){

                            //Getting the Segment price
                           
                            var segmentPrice = salesOrderRec.getSublistValue({
                                sublistId : 'item',
                                fieldId : 'custcol_segment_price',
                                line : i
                            });

                            log.debug('segmentPrice', segmentPrice);

                            if(segmentPrice){

                                //Removing the commas from the string.
                                segmentPrice = segmentPrice.replace(/,/g, '');
                                log.debug('check', isNaN(segmentPrice));

                                //throwing an error if the value is not a number.

                                if(isNaN(segmentPrice)){
                                    errorExists = true;
                                    errorMessage += "<br> Segment Price : " +segmentPrice + " on line "+(i+1)+" is not a numerical value.";                                    
                                }
                            }
                        }
                        if(errorExists){
                            throw new Error(errorMessage);
                        }
                        
                    }
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
            try {
            } catch (ex) {
                log.error(ex.name, ex.message);
            }
        }
        return {
            //beforeLoad: beforeLoad,
           beforeSubmit: beforeSubmit,
           // afterSubmit: afterSubmit
        };
    });