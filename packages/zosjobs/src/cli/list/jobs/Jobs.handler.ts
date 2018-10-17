/*
* This program and the accompanying materials are made available under the terms of the *
* Eclipse Public License v2.0 which accompanies this distribution, and is available at *
* https://www.eclipse.org/legal/epl-v20.html                                      *
*                                                                                 *
* SPDX-License-Identifier: EPL-2.0                                                *
*                                                                                 *
* Copyright Contributors to the Zowe Project.                                     *
*                                                                                 *
*/

import { ICommandHandler, IHandlerParameters } from "@brightside/imperative";
import { IJob } from "../../../api/doc/response/IJob";
import { GetJobs } from "../../../api/GetJobs";
import { JobsConstants } from "../../../..";
import { ZosmfBaseHandler } from "../../../../../zosmf/src/ZosmfBaseHandler";

/**
 * Handler for the "zos-jobs list jobs" command.
 * @export
 * @class JobsHandler
 * @implements {ICommandHandler}
 */
export default class JobsHandler extends ZosmfBaseHandler {
    /**
     * Convenience accessor for the response APIs
     * @private
     * @type {*}
     * @memberof SubmitDataSetHandler
     */
    private console: any;
    private data: any;

    /**
     * Handler for the "zos-jobs list jobs" command. Produces a tabular list of jobs on spool based on
     * the input parameters.
     * @param {IHandlerParameters} params - see interface for details
     * @returns {Promise<void>} - promise to fulfill or reject when the command is complete
     * @memberof JobsHandler
     */
    public async processWithSession(params: IHandlerParameters): Promise<void> {
        // Save the needed parameters for convenience
        this.console = params.response.console;
        this.data = params.response.data;

        // Obtain the list of jobs - by default uses the session user and * for owner and prefix.
        const prefix: string = (params.arguments.owner != null) ? params.arguments.owner : this.mSession.ISession.user;
        const owner: string = (params.arguments.prefix != null) ? params.arguments.prefix : JobsConstants.DEFAULT_PREFIX;
        const jobs: IJob[] = await GetJobs.getJobsByOwnerAndPrefix(this.mSession, prefix, owner);

        // Populate the response object
        params.response.data.setObj(jobs);
        params.response.data.setMessage(`List of jobs returned for prefix "${prefix}" and owner "${owner}"`);

        // Format the output with the default fields
        params.response.format.output({
            fields: ["jobid", "retcode", "jobname", "status"],
            output: jobs,
            format: "table"
        });
    }
}
