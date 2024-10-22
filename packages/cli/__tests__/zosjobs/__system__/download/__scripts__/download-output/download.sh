#!/bin/bash

# Max attempt count
ATTEMPTS=10

# Wait time between attempts
WAIT=10

# Submit the job and ensure the RC is 0
JOBID=`zowe jobs submit ds "$1" --rff jobid --rft string`
RC=$?
if [ $RC -gt 0 ]
then
    echo $JOBID 1>&2
    echo "Submit returned a non-zero return code" 1>&2
    exit $RC
fi

# Echo the job ID for further use
echo "Submitted job ID: $JOBID"

# Loop until the job goes to the output queue
until [ $ATTEMPTS -gt 0 ]
do
    STATUS=`zowe jobs view job-status-by-jobid $JOBID --rff status --rft string`
    RC=$?
    if [ $RC -gt 0 ] ; then
        echo $STATUS 1>&2
        echo "The view job status command returned a non-zero rc: $RC" 1>&2
        exit $RC
    fi
    if [ "$STATUS" = "OUTPUT" ] ; then
        break
    else
        ((ATTEMPTS--))
        sleep $WAIT
    fi
done

# Check status
if [ $ATTEMPTS -eq 0 -a "$STATUS" != "OUTPUT" ]; then
    echo "Wait time limit reached" 1>&2
    exit 1
fi

# Download the output
zowe jobs download output $JOBID --ojd
RC=$?

if [ $RC -gt 0 ]
then
    echo "The download output command returned a non-zero rc: $RC" 1>&2
    exit $RC
fi
