/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

/* eslint-disable complexity */

import dateMath from '@elastic/datemath';
import { get, getOr, isEmpty, find } from 'lodash/fp';
import moment from 'moment';

import { updateAlertStatus } from '../../containers/detection_engine/alerts/api';
import { SendAlertToTimelineActionProps, UpdateAlertStatusActionProps } from './types';
import {
  TimelineNonEcsData,
  GetOneTimeline,
  TimelineResult,
  Ecs,
  TimelineStatus,
  TimelineType,
  GetTimelineDetailsQuery,
  DetailItem,
} from '../../../graphql/types';
import { oneTimelineQuery } from '../../../timelines/containers/one/index.gql_query';
import { timelineDefaults } from '../../../timelines/store/timeline/defaults';
import {
  omitTypenameInTimeline,
  formatTimelineResultToModel,
} from '../../../timelines/components/open_timeline/helpers';
import { convertKueryToElasticSearchQuery } from '../../../common/lib/keury';
import {
  replaceTemplateFieldFromQuery,
  replaceTemplateFieldFromMatchFilters,
  replaceTemplateFieldFromDataProviders,
} from './helpers';
import { KueryFilterQueryKind } from '../../../common/store';
import { DataProvider } from '../../../timelines/components/timeline/data_providers/data_provider';
import { timelineDetailsQuery } from '../../../timelines/containers/details/index.gql_query';

export const getUpdateAlertsQuery = (eventIds: Readonly<string[]>) => {
  return {
    query: {
      bool: {
        filter: {
          terms: {
            _id: [...eventIds],
          },
        },
      },
    },
  };
};

export const getFilterAndRuleBounds = (
  data: TimelineNonEcsData[][]
): [string[], number, number] => {
  const stringFilter = data?.[0].filter((d) => d.field === 'signal.rule.filters')?.[0]?.value ?? [];

  const eventTimes = data
    .flatMap((alert) => alert.filter((d) => d.field === 'signal.original_time')?.[0]?.value ?? [])
    .map((d) => moment(d));

  return [stringFilter, moment.min(eventTimes).valueOf(), moment.max(eventTimes).valueOf()];
};

export const updateAlertStatusAction = async ({
  query,
  alertIds,
  status,
  selectedStatus,
  setEventsLoading,
  setEventsDeleted,
  onAlertStatusUpdateSuccess,
  onAlertStatusUpdateFailure,
}: UpdateAlertStatusActionProps) => {
  try {
    setEventsLoading({ eventIds: alertIds, isLoading: true });

    const queryObject = query ? { query: JSON.parse(query) } : getUpdateAlertsQuery(alertIds);

    const response = await updateAlertStatus({ query: queryObject, status: selectedStatus });
    // TODO: Only delete those that were successfully updated from updatedRules
    setEventsDeleted({ eventIds: alertIds, isDeleted: true });

    onAlertStatusUpdateSuccess(response.updated, selectedStatus);
  } catch (error) {
    onAlertStatusUpdateFailure(selectedStatus, error);
  } finally {
    setEventsLoading({ eventIds: alertIds, isLoading: false });
  }
};

export const determineToAndFrom = ({ ecsData }: { ecsData: Ecs }) => {
  const ellapsedTimeRule = moment.duration(
    moment().diff(
      dateMath.parse(ecsData.signal?.rule?.from != null ? ecsData.signal?.rule?.from[0] : 'now-0s')
    )
  );

  const from = moment(ecsData.timestamp ?? new Date())
    .subtract(ellapsedTimeRule)
    .toISOString();
  const to = moment(ecsData.timestamp ?? new Date()).toISOString();

  return { to, from };
};

export const getThresholdAggregationDataProvider = (
  ecsData: Ecs,
  nonEcsData: TimelineNonEcsData[]
): DataProvider[] => {
  const aggregationField = ecsData.signal?.rule?.threshold.field;
  const aggregationValue =
    get(aggregationField, ecsData) ?? find(['field', aggregationField], nonEcsData)?.value;
  const dataProviderValue = Array.isArray(aggregationValue)
    ? aggregationValue[0]
    : aggregationValue;

  if (!dataProviderValue) {
    return [];
  }

  const aggregationFieldId = aggregationField.replace('.', '-');

  return [
    {
      and: [],
      id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-timeline-1-${aggregationFieldId}-${dataProviderValue}`,
      name: ecsData.signal?.rule?.threshold.field,
      enabled: true,
      excluded: false,
      kqlQuery: '',
      queryMatch: {
        field: aggregationField,
        value: dataProviderValue,
        operator: ':',
      },
    },
  ];
};

export const sendAlertToTimelineAction = async ({
  apolloClient,
  createTimeline,
  ecsData,
  nonEcsData,
  updateTimelineIsLoading,
}: SendAlertToTimelineActionProps) => {
  let openAlertInBasicTimeline = true;
  const noteContent = ecsData.signal?.rule?.note != null ? ecsData.signal?.rule?.note[0] : '';
  const timelineId =
    ecsData.signal?.rule?.timeline_id != null ? ecsData.signal?.rule?.timeline_id[0] : '';
  const { to, from } = determineToAndFrom({ ecsData });

  if (timelineId !== '' && apolloClient != null) {
    try {
      updateTimelineIsLoading({ id: 'timeline-1', isLoading: true });
      const [responseTimeline, eventDataResp] = await Promise.all([
        apolloClient.query<GetOneTimeline.Query, GetOneTimeline.Variables>({
          query: oneTimelineQuery,
          fetchPolicy: 'no-cache',
          variables: {
            id: timelineId,
          },
        }),
        apolloClient.query<GetTimelineDetailsQuery.Query, GetTimelineDetailsQuery.Variables>({
          query: timelineDetailsQuery,
          fetchPolicy: 'no-cache',
          variables: {
            defaultIndex: [],
            docValueFields: [],
            eventId: ecsData._id,
            indexName: ecsData._index ?? '',
            sourceId: 'default',
          },
        }),
      ]);
      const resultingTimeline: TimelineResult = getOr({}, 'data.getOneTimeline', responseTimeline);
      const eventData: DetailItem[] = getOr([], 'data.source.TimelineDetails.data', eventDataResp);
      if (!isEmpty(resultingTimeline)) {
        const timelineTemplate: TimelineResult = omitTypenameInTimeline(resultingTimeline);
        openAlertInBasicTimeline = false;
        const { timeline, notes } = formatTimelineResultToModel(
          timelineTemplate,
          true,
          timelineTemplate.timelineType ?? TimelineType.default
        );
        const query = replaceTemplateFieldFromQuery(
          timeline.kqlQuery?.filterQuery?.kuery?.expression ?? '',
          eventData,
          timeline.timelineType
        );
        const filters = replaceTemplateFieldFromMatchFilters(timeline.filters ?? [], eventData);
        const dataProviders = replaceTemplateFieldFromDataProviders(
          timeline.dataProviders ?? [],
          eventData,
          timeline.timelineType
        );

        return createTimeline({
          from,
          timeline: {
            ...timeline,
            title: '',
            timelineType: TimelineType.default,
            templateTimelineId: null,
            status: TimelineStatus.draft,
            dataProviders,
            eventType: 'all',
            filters,
            dateRange: {
              start: from,
              end: to,
            },
            kqlQuery: {
              filterQuery: {
                kuery: {
                  kind: timeline.kqlQuery?.filterQuery?.kuery?.kind ?? 'kuery',
                  expression: query,
                },
                serializedQuery: convertKueryToElasticSearchQuery(query),
              },
              filterQueryDraft: {
                kind: timeline.kqlQuery?.filterQuery?.kuery?.kind ?? 'kuery',
                expression: query,
              },
            },
            noteIds: notes?.map((n) => n.noteId) ?? [],
            show: true,
          },
          to,
          ruleNote: noteContent,
          notes: notes ?? null,
        });
      }
    } catch {
      openAlertInBasicTimeline = true;
      updateTimelineIsLoading({ id: 'timeline-1', isLoading: false });
    }
  }

  if (
    ecsData.signal?.rule?.type?.length &&
    ecsData.signal?.rule?.type[0] === 'threshold' &&
    openAlertInBasicTimeline
  ) {
    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        dataProviders: [
          {
            and: [],
            id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-timeline-1-alert-id-${ecsData._id}`,
            name: ecsData._id,
            enabled: true,
            excluded: false,
            kqlQuery: '',
            queryMatch: {
              field: '_id',
              value: ecsData._id,
              operator: ':',
            },
          },
          ...getThresholdAggregationDataProvider(ecsData, nonEcsData),
        ],
        id: 'timeline-1',
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: ecsData.signal?.rule?.language?.length
                ? (ecsData.signal?.rule?.language[0] as KueryFilterQueryKind)
                : 'kuery',
              expression: ecsData.signal?.rule?.query?.length ? ecsData.signal?.rule?.query[0] : '',
            },
            serializedQuery: ecsData.signal?.rule?.query?.length
              ? ecsData.signal?.rule?.query[0]
              : '',
          },
          filterQueryDraft: {
            kind: ecsData.signal?.rule?.language?.length
              ? (ecsData.signal?.rule?.language[0] as KueryFilterQueryKind)
              : 'kuery',
            expression: ecsData.signal?.rule?.query?.length ? ecsData.signal?.rule?.query[0] : '',
          },
        },
      },
      to,
      ruleNote: noteContent,
    });
  } else {
    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        dataProviders: [
          {
            and: [],
            id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-timeline-1-alert-id-${ecsData._id}`,
            name: ecsData._id,
            enabled: true,
            excluded: false,
            kqlQuery: '',
            queryMatch: {
              field: '_id',
              value: ecsData._id,
              operator: ':',
            },
          },
        ],
        id: 'timeline-1',
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: 'kuery',
              expression: '',
            },
            serializedQuery: '',
          },
          filterQueryDraft: {
            kind: 'kuery',
            expression: '',
          },
        },
      },
      to,
      ruleNote: noteContent,
    });
  }
};
