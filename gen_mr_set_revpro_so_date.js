/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope TargetAccount
 */
define(['N/search', 'N/record', 'N/runtime', 'N/format'],
    function(search, record, runtime, format) {
        /**
         * Marks the beginning of the Map/Reduce process and generates input data.
         *
         * @typedef {Object} ObjectRef
         * @property {number} id - Internal ID of the record instance
         * @property {string} type - Record type id
         *
         * @return {Array|Object|Search|RecordRef} inputSummary
         * @since 2015.1
         */
        function getInputData() {
            try {

                var priorDate = new Date();
                priorDate.setDate(priorDate.getDate() - 1);
                log.debug('priorDate', priorDate);

                var invoiceSearchObj = search.create({
                    type: "invoice",
                    filters: [
                        ["type", "anyof", "CustInvc"],
                        "AND",
                        ["createdfrom.custbody_genesys_revpro_date", "isempty", ""],
                        "AND",
                        ["mainline", "is", "T"],
                        "AND",
                        ["createdfrom.type", "anyof", "SalesOrd"],
                        "AND",
                        ["datecreated", "after", "24/11/2022 12:00 am", "01/06/2022 11:59 pm"]
                    ],
                    columns: [
                        search.createColumn({
                            name: "internalid",
                            label: "Internal ID"
                        }),
                        search.createColumn({
                            name: "createdfrom",
                            label: "Created From"
                        }),
                        search.createColumn({
                            name: "datecreated",
                            label: "Date Created"
                        }),
                        search.createColumn({
                            name: "custbody_genesys_revpro_date",
                            label: "RevPro SO Date"
                        }),
                        search.createColumn({
                            name: "custbody_genesys_hold_do_not_fulfill",
                            label: "Hold - Do not Fulfill"
                        }),
                        search.createColumn({
                            name: "custbody_genesys_hold_do_not_invoice",
                            label: "Hold - Do not Invoice"
                        }),
                        search.createColumn({
                            name: "custbody_genesys_hold_do_not_fulfill",
                            join: "createdFrom",
                            label: "Hold - Do not Fulfill"
                        }),
                        search.createColumn({
                            name: "custbody_genesys_hold_do_not_invoice",
                            join: "createdFrom",
                            label: "Hold - Do not Invoice"
                        })
                    ]
                });
                var searchResultCount = invoiceSearchObj.runPaged().count;
                log.debug("invoiceSearchObj result count", searchResultCount);
                invoiceSearchObj.run().each(function(result) {
                    var invoiceId = result.id;
                    var salesOrderId = result.getValue('createdfrom');
                    var invoice_SoRevproDate = result.getValue('custbody_genesys_revpro_date');
                    var inv_HoldDontInvoice = result.getValue('custbody_genesys_hold_do_not_invoice');
                    var inv_HoldDontFulfill = result.getValue('custbody_genesys_hold_do_not_fulfill');
                    var so_HoldDontInvoice = result.getValue({
                        name: 'custbody_genesys_hold_do_not_invoice',
                        join: 'createdFrom'
                    });
                    var so_HoldDontFulfill = result.getValue({
                        name: 'custbody_genesys_hold_do_not_fulfill',
                        join: 'createdFrom'
                    });

                    if (so_HoldDontInvoice == false && so_HoldDontInvoice == false) {
                        record.submitFields({
                            type: 'salesorder',
                            id: salesOrderId,
                            values: {
                                'custbody_genesys_revpro_date': priorDate
                            }
                        });
                    }

                    if ((invoice_SoRevproDate == '' || invoice_SoRevproDate == null) && inv_HoldDontFulfill == false && inv_HoldDontFulfill == false) {
                        record.submitFields({
                            type: 'invoice',
                            id: invoiceId,
                            values: {
                                'custbody_genesys_revpro_date': priorDate
                            }
                        })
                    }

                    return true;
                });



            } catch (ex) {
                log.error(ex.name, 'getInputData state, message = ' + ex.message);
            }
        }
        /**
         * Executes when the map entry point is triggered and applies to each key/value pair.
         *
         * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
         * @since 2015.1
         */
        function map(context) {
            try {

            } catch (ex) {
                log.error(ex.name, ex.message);
            }
        }
        /**
         * Executes when the reduce entry point is triggered and applies to each group.
         *
         * @param {ReduceSummary} context - Data collection containing the groups to process through the reduce stage
         * @since 2015.1
         */
        function reduce(context) {
            try {

            } catch (ex) {
                log.error(ex.name, ex.message);
            }
        }


        /**
         * Executes when the summarize entry point is triggered and applies to the result set.
         *
         * @param {Summary} summary - Holds statistics regarding the execution of a map/reduce script
         * @since 2015.1
         */
        function summarize(summary) {
            try {} catch (ex) {
                log.error(ex.name, ex.message);
            }
        }
        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize
        };
    });