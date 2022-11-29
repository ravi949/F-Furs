/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope TargetAccount
 * Front-end suitelet script to get and return a list of eligible promotions upon which a new iTPM Settlement record can be created.
 */
define(['N/search','N/record'],

    function(search, record) {

    /**
     * Definition of the Suitelet script trigger point.
     *
     * @param {Object} context
     * @param {ServerRequest} context.request - Encapsulation of the incoming request
     * @param {ServerResponse} context.response - Encapsulation of the Suitelet response
     * @Since 2015.2
     */
    function onRequest(context){
        try{
            var request = context.request,response = context.response,params = request.parameters;

            log.debug('params');



                      
        }catch (e) {
            log.error(e.name,'record type = iTPM Deduction, record id='+params.ddn+', message = '+e.message);
        }
    }

    return {
        onRequest: onRequest
    };

});
