import schedule from 'node-schedule';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface ScheduledJob {
  id: string;
  name: string;
  cronPattern: string;
  message: {
    phone_num: string;
    content: string;
    type: string;
  };
  status: 'active' | 'paused' | 'cancelled';
}

const activeJobs = new Map<string, schedule.Job>();

// Helper function to detect one-time cron
function isOneTimeCron(cronPattern: string) {
  return cronPattern.includes('?') || cronPattern.split(' ').length > 5;
}

// Convert cron to Date (basic example)
function parseCronToDate(cronPattern: any) {
  const parts = cronPattern.split(' ');
  return new Date(Date.UTC(parts[6], parts[4] - 1, parts[3], parts[2], parts[1], parts[0]));
}

export const initializeScheduledJobs = async () => {
  try {
    // Reset active jobs
    for (const [jobId, job] of activeJobs.entries()) {
      job.cancel();
    }
    activeJobs.clear();

    // Fetch and initialize jobs from database
    const response = await axios.get(`${process.env.HOST_URL}/api/campaigns/server?auth_key=${process.env.WEBHOOK_VERIFY_TOKEN}`);
    const jobs = response.data.data;

    const initPromises = jobs
      .filter((job: any) => job.schedule.status === 'SCHEDULED')
      .map((job: any) => scheduleJobs(job.schedule.cron_pattern, job));

    await Promise.all(initPromises);

    console.log(activeJobs)

    console.log(`Initialized ${jobs.length} scheduled jobs`);
  } catch (error) {
    console.error('Failed to initialize jobs:', error);
    throw error; // Propagate error to server startup
  }
};

export const scheduleJobs = async (cronPattern: string, jobData: any) => {
  let job;

  if (isOneTimeCron(cronPattern)) {
    const date = parseCronToDate(cronPattern); // Convert cron to Date
    job = schedule.scheduleJob(date, async () => {
      await executeJob(jobData);
    });
  } else {
    job = schedule.scheduleJob(cronPattern, async () => {
      await executeJob(jobData);
    });
  }

  activeJobs.set(jobData.id, job);
}

export const rescheduleJob = async (id: string, jobData: any) => {
  try {
    if (!id || !jobData) {
      throw new Error('Missing Cron Id or Schedule Data');
    }

    const cronPattern = jobData.schedule.cron_pattern;
    let job;

    // Cancel existing job if it exists
    const existingJob = activeJobs.get(id);
    if (existingJob) {
      existingJob.cancel();
    }

    // Schedule new job based on pattern type
    if (isOneTimeCron(cronPattern)) {
      const date = parseCronToDate(cronPattern);
      job = schedule.scheduleJob(date, async () => {
        await executeJob(jobData);
      });
    } else {
      job = schedule.scheduleJob(cronPattern, async () => {
        await executeJob(jobData);
      });
    }

    // Update activeJobs map with new job
    if (job) {
      activeJobs.set(id, job);
      return {
        status: 'success',
        message: `Job ${id} rescheduled successfully`,
        nextInvocation: job.nextInvocation()
      };
    } else {
      throw new Error('Failed to reschedule job');
    }
  } catch (err) {
    console.error('Reschedule error:', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error occurred'
    };
  }
}

export const cancelJob = async (id: string) => {
  try {
    if (!id) {
      throw new Error('Missing Cron Id');
    }

    // Cancel existing job if it exists
    const existingJob = activeJobs.get(id);
    if (existingJob) {
      existingJob.cancel();
      return {
        status: 'success',
        message: `Job ${id} cancelled successfully`
      };
    }

    return {
      status: 'warning',
      message: `Job ${id} cancelling failed`
    };
  } catch (err) {
    console.error('Cancelling error:', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error occurred'
    };
  }
}

const executeJob = async (jobData: any) => {
  try {
    console.log('Executing job:', jobData, new Date());

    // Make API call with jobData including batches
    for (const batch of jobData.batches) {
      const response = await axios.post(
        `${process.env.HOST_URL}/api/campaigns/server/execute/?auth_key=${process.env.WEBHOOK_VERIFY_TOKEN}`,
        {
          campaignId: jobData.id,
          batchId: batch.id,
          next_invocation: activeJobs.get(jobData.id)?.nextInvocation(),
          data: jobData,
          next_execution: activeJobs.get(jobData.id)?.nextInvocation() ? new Date(activeJobs.get(jobData.id)?.nextInvocation() as Date) : null,
        }
      );

      console.log('Job execution response:', response.data);
    }
    const response = await axios.put(
      `${process.env.HOST_URL}/api/campaigns/server/?auth_key=${process.env.WEBHOOK_VERIFY_TOKEN}`,
      {
        campaignId: jobData.id,
        status: activeJobs.get(jobData.id)?.nextInvocation() ? 'IN_PROGRESS' : 'COMPLETED',
      }
    );
    console.log('Next invocation:', activeJobs.get(jobData.id)?.nextInvocation(), new Date(activeJobs.get(jobData.id)?.nextInvocation() as Date));
  } catch (error) {
    console.error('Job execution failed:', error);
    throw error;
  }
};