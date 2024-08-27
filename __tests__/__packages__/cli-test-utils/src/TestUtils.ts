/*
* This program and the accompanying materials are made available under the terms of the
* Eclipse Public License v2.0 which accompanies this distribution, and is available at
* https://www.eclipse.org/legal/epl-v20.html
*
* SPDX-License-Identifier: EPL-2.0
*
* Copyright Contributors to the Zowe Project.
*
*/

import * as fs from "fs";
import { spawnSync, SpawnSyncReturns, ExecFileException } from "child_process";
import { ITestEnvironment } from "./environment/doc/response/ITestEnvironment";
import { AbstractSession, CommandProfiles, ICommandDefinition, IHandlerParameters, IO } from "@zowe/imperative";
import { DeleteJobs, ICommonJobParms, IDeleteJobParms, IJob } from "@zowe/zos-jobs-for-zowe-sdk";
import { Delete } from "@zowe/zos-files-for-zowe-sdk";
import { posix } from "path";

/**
 * Delete a local testing file after use
 * @param {string} filePath - File path of temporary file
 */
export function deleteLocalFile(filePath: string): void {
    try {
        fs.unlinkSync(filePath);
    } catch {
        // If fs.unlinkSync fails, try to delete it with IO.deleteFile
        try {
            IO.deleteFile(posix.basename(filePath));
        } catch {
            throw new Error(`Error deleting local file: ${filePath}`);
        }
    }
}

/**
 * Delete a uss file from the mainframe
 * @param {AbstractSession} session - z/OSMF connection info
 * @param {string} fileName - The name of the USS file
 */
export function deleteFiles(session: AbstractSession, fileName: string): void {
    Delete.ussFile(session, fileName);
}

/**
 * Delete a dataset from the mainframe
 * @param {AbstractSession} session - z/OSMF connection info
 * @param {string} datasetName - The name of the dataset
 */
export function deleteDataset(session: AbstractSession, dataSetName: string): void {
    Delete.dataSet(session, dataSetName);
}

/**
 * Delete a job from the mainframe using Zowe SDKs - IJob
 * @param {AbstractSession} session - z/OSMF connection info
 * @param {IJob} job - the job that you want to delete
 */
export function deleteJob(session: AbstractSession, job: IJob): void {
    DeleteJobs.deleteJobForJob(session, job);
}

/**
 * Delete a job from the mainframe using Zowe SDKs - jobid, jobname
 * @param {AbstractSession} session - z/OSMF connection info
 * @param {params} ICommonJobParms - constains jobname and jobid for job to delete
 */
export function deleteJobCommon(session: AbstractSession, params: ICommonJobParms): void {
    DeleteJobs.deleteJobCommon(session, params as IDeleteJobParms);
}


/**
 * Execute a CLI script
 * @export
 * @param  scriptPath - the path to the script
 * @param  testEnvironment - the test environment with env
 * @param [args=[]] - set of script args (optional)
 * @returns  node.js details about the results of
 *           executing the script, including exit code and output
 */
export function runCliScript(scriptPath: string, testEnvironment: ITestEnvironment<any>, args: any[] = []): SpawnSyncReturns<Buffer> {
    if (fs.existsSync(scriptPath)) {

        // We force the color off to prevent any oddities in the snapshots or expected values
        // Color can vary OS/terminal
        const childEnv = JSON.parse(JSON.stringify(process.env));
        childEnv.FORCE_COLOR = "0";
        for (const key of Object.keys(testEnvironment.env)) {
            // copy the values from the env
            childEnv[key] = testEnvironment.env[key];
        }

        if (process.platform === "win32") {
            // Execute the command synchronously
            const response = spawnSync("sh", [scriptPath].concat(args), {
                cwd: testEnvironment.workingDir,
                encoding: "buffer",
                env: childEnv
            });
            if ((response.error as ExecFileException)?.code === "ENOENT") {
                throw new Error(`"sh" is missing from your PATH. Check that Git Bash is installed with the option to ` +
                    `"Use Git and Unix Tools from Windows Command Prompt".`);
            }
            return response;
        }

        // Check to see if the file is executable
        try {
            fs.accessSync(scriptPath, fs.constants.X_OK);
        } catch {
            fs.chmodSync(scriptPath, "755");
        }
        return spawnSync(scriptPath, args, {
            cwd: testEnvironment.workingDir,
            env: childEnv,
            encoding: "buffer"
        });

    } else {
        throw new Error(`The script file ${scriptPath} doesn't exist`);

    }
}

/**
 * Type for handler data used to build mock IHandlerParameters object.
 * The type inherits from IHandlerParameters but is different:
 * - `arguments` omits the required properties `$0` and `_`
 * - All properties are optional except for `definition`
 */
type PartialHandlerParameters = Partial<Omit<IHandlerParameters, "arguments">> & {
    arguments?: Record<string, any>;
    definition: ICommandDefinition;
};

/**
 * Build a mocked IHandlerParameters object. Includes the following properties:
 * - `response` - Mocked IHandlerResponseApi
 * - `arguments`
 *   - `$0` - hardcoded to "zowe"
 *   - `_` = `params.positionals`
 *   - `...params.arguments`
 * - `positionals` = `params.positionals`
 * - `profiles` = `params.profiles`
 * - `definition` = `params.definition`
 * - `fullDefinition` = `params.definition`
 * - `stdin` - hardcoded to `process.stdin`
 * @param params Partial handler parameters object (see above for usage)
 * @returns Mocked handler parameters object. Most mocks do nothing, but the
 * following methods call `expect().toMatchSnapshot`:
 * - `response.data`: `setMessage`, `setObj`
 * - `response.console`: `log`, `error`
 * - `response.format`: `output`
 */
export function mockHandlerParameters(params: PartialHandlerParameters): IHandlerParameters {
    return {
        response: {
            data: {
                setMessage: jest.fn((setMsgArgs) => {
                    expect(setMsgArgs).toMatchSnapshot();
                }) as any,
                setObj: jest.fn((setObjArgs) => {
                    expect(Buffer.isBuffer(setObjArgs) ? setObjArgs.toString() : setObjArgs).toMatchSnapshot();
                }),
                setExitCode: jest.fn()
            },
            console: {
                log: jest.fn((logs) => {
                    expect(logs.toString()).toMatchSnapshot();
                }) as any,
                error: jest.fn((errors) => {
                    expect(errors.toString()).toMatchSnapshot();
                }) as any,
                errorHeader: jest.fn(() => undefined) as any,
                prompt: jest.fn(async () => null) as any
            },
            progress: {
                startBar: jest.fn((parms) => undefined),
                endBar: jest.fn(() => undefined)
            },
            format: {
                output: jest.fn((parms) => {
                    expect(parms).toMatchSnapshot();
                })
            }
        },
        arguments: {
            $0: "zowe",
            _: params.positionals || [],
            ...params.arguments || {}
        },
        positionals: params.positionals || [],
        // eslint-disable-next-line deprecation/deprecation
        profiles: params.profiles || new CommandProfiles(new Map()),
        definition: params.definition,
        fullDefinition: params.definition,
        stdin: process.stdin,
        isChained: params.isChained
    };
}
