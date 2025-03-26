/*
 * Copyright 2023 Harness, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  Container,
  PageBody,
  Text,
  TableV2,
  Layout,
  StringSubstitute,
  FlexExpander,
  Utils,
  stringSubstitute
} from '@harnessio/uicore'
import { Icon } from '@harnessio/icons'
import { Color, FontVariation } from '@harnessio/design-system'
import { Link } from 'react-router-dom'
import { useGet } from 'restful-react'
import type { CellProps, Column } from 'react-table'
import { Case, Match, Render, Truthy } from 'react-jsx-match'
import { defaultTo, isEmpty, noop } from 'lodash-es'
import { PullRequestFilterOption, PullRequestReviewFilterOption, PullRequestState, SpacePRTabs } from 'utils/GitUtils'
import { useAppContext } from 'AppContext'
import { useStrings } from 'framework/strings'
import {
  voidFn,
  getErrorMessage,
  LIST_FETCHING_LIMIT,
  PageBrowserProps,
  ColorName,
  LabelFilterObj,
  LabelFilterType,
  ScopeLevelEnum,
  PageAction
} from 'utils/Utils'
import { usePageIndex } from 'hooks/usePageIndex'
import { useGetSpaceParam } from 'hooks/useGetSpaceParam'
import { useUpdateQueryParams } from 'hooks/useUpdateQueryParams'
import { useQueryParams } from 'hooks/useQueryParams'
import type { TypesLabelPullReqAssignmentInfo, TypesPrincipalInfo, TypesPullReqRepo } from 'services/code'
import { PrevNextPagination } from 'components/ResourceListingPagination/ResourceListingPagination'
import { NoResultCard } from 'components/NoResultCard/NoResultCard'
import { PipeSeparator } from 'components/PipeSeparator/PipeSeparator'
import { GitRefLink } from 'components/GitRefLink/GitRefLink'
import { PullRequestStateLabel } from 'components/PullRequestStateLabel/PullRequestStateLabel'
import { LoadingSpinner } from 'components/LoadingSpinner/LoadingSpinner'
import { TimePopoverWithLocal } from 'utils/timePopoverLocal/TimePopoverWithLocal'
import { Label } from 'components/Label/Label'
import { getConfig } from 'services/config'
import { SpacePullRequestsContentHeader } from './PullRequestsContentHeader/SpacePullRequestsContentHeader'
import css from './PullRequests.module.scss'

interface SpacePullRequestsProps {
  activeTab: SpacePRTabs
  includeSubspaces: ScopeLevelEnum
  setIncludeSubspaces: (sub: ScopeLevelEnum) => void
}

export function SpacePullRequestsListing({ activeTab, includeSubspaces, setIncludeSubspaces }: SpacePullRequestsProps) {
  const { getString } = useStrings()
  const { routes, routingId, currentUser } = useAppContext()
  const [searchTerm, setSearchTerm] = useState<string | undefined>()
  const browserParams = useQueryParams<PageBrowserProps>()
  const [filter, setFilter] = useState(browserParams?.state || (PullRequestFilterOption.OPEN as string))
  const [reviewFilter, setReviewFilter] = useState(
    browserParams?.review || (PullRequestReviewFilterOption.PENDING as string)
  )
  const [authorFilter, setAuthorFilter] = useState<string>(browserParams?.author ?? '')
  const [labelFilter, setLabelFilter] = useState<LabelFilterObj[]>([])
  const [pageAction, setPageAction] = useState<{ action: PageAction; timestamp: number }>({
    action: PageAction.NEXT,
    timestamp: 1
  })
  const space = useGetSpaceParam()
  const { updateQueryParams, replaceQueryParams } = useUpdateQueryParams()
  const pageInit = browserParams.page ? parseInt(browserParams.page) : 1
  const [page, setPage] = usePageIndex(pageInit)

  const { data: principal, refetch: refetchPrincipal } = useGet<TypesPrincipalInfo>({
    base: getConfig('code/api/v1'),
    path: `/principals/${browserParams.author}`,
    queryParams: {
      accountIdentifier: routingId
    },
    lazy: true
  })
  useEffect(() => {
    const params = {
      ...browserParams,
      ...(Boolean(authorFilter) && { author: authorFilter }),
      // ...(page >= 1 && { page: page.toString() }),
      ...(filter && { state: filter }),
      ...(reviewFilter && { review: reviewFilter }),
      subspace: includeSubspaces.toString()
    }

    updateQueryParams(params, undefined, true)

    if (page <= 1) {
      const updateParams = { ...params }
      delete updateParams.page
      replaceQueryParams(updateParams, undefined, true)
    }

    if (!authorFilter && browserParams.author) {
      const paramList = { ...params }
      delete paramList.author
      replaceQueryParams(paramList, undefined, true)
    }

    if (activeTab === SpacePRTabs.CREATED || !reviewFilter) {
      const paramList = { ...params }
      delete paramList.review
      replaceQueryParams(paramList, undefined, true)
    }

    if (browserParams.author) {
      refetchPrincipal()
    }
  }, [page, filter, reviewFilter, authorFilter, activeTab, includeSubspaces]) // eslint-disable-line react-hooks/exhaustive-deps

  const [accountIdentifier, orgIdentifier, projectIdentifier] = space?.split('/') || []

  const {
    data,
    error: prError,
    loading: prLoading,
    refetch: refetchPrs
  } = useGet<TypesPullReqRepo[]>({
    //add type
    path: `/api/v1/pullreq`,
    queryParams: {
      accountIdentifier,
      orgIdentifier,
      projectIdentifier,
      limit: String(LIST_FETCHING_LIMIT),
      exclude_description: true,
      page,
      sort: filter == PullRequestFilterOption.MERGED ? 'merged' : 'number',
      order: 'desc',
      query: searchTerm,
      include_subspaces: includeSubspaces === ScopeLevelEnum.ALL,
      state: browserParams.state ? browserParams.state : filter == PullRequestFilterOption.ALL ? '' : filter,
      ...(activeTab === SpacePRTabs.REVIEW_REQUESTED && {
        reviewer_id: Number(currentUser.id),
        review_decision: reviewFilter
      }),
      ...(activeTab === SpacePRTabs.CREATED && { created_by: Number(currentUser.id) }),
      ...(authorFilter && activeTab === SpacePRTabs.REVIEW_REQUESTED && { created_by: Number(authorFilter) }),

      ...(labelFilter.filter(({ type, valueId }) => type === 'label' || valueId === -1).length && {
        label_id: labelFilter
          .filter(({ type, valueId }) => type === 'label' || valueId === -1)
          .map(({ labelId }) => labelId)
      }),
      ...(labelFilter.filter(({ type }) => type === 'value').length && {
        value_id: labelFilter
          .filter(({ type, valueId }) => type === 'value' && valueId !== -1)
          .map(({ valueId }) => valueId)
      }),

      ...(page > 1
        ? pageAction?.action === PageAction.NEXT
          ? { updated_lt: pageAction.timestamp }
          : { updated_gt: pageAction.timestamp }
        : {})
    },
    queryParamStringifyOptions: {
      arrayFormat: 'repeat'
    },
    debounce: 500,
    lazy: !currentUser
  })

  const handleLabelClick = (labelFilterArr: LabelFilterObj[], clickedLabel: TypesLabelPullReqAssignmentInfo) => {
    // if not present - add :
    const isLabelAlreadyAdded = labelFilterArr.map(({ labelId }) => labelId).includes(clickedLabel.id || -1)
    const updatedLabelsList = [...labelFilterArr]
    if (!isLabelAlreadyAdded && clickedLabel?.id) {
      if (clickedLabel.value && clickedLabel.value_id) {
        updatedLabelsList.push({
          labelId: clickedLabel.id,
          type: LabelFilterType.VALUE,
          valueId: clickedLabel.value_id,
          labelObj: clickedLabel,
          valueObj: {
            id: clickedLabel.value_id,
            color: clickedLabel.value_color,
            label_id: clickedLabel.id,
            value: clickedLabel.value
          }
        })
      } else if (clickedLabel.value_count && !clickedLabel.value_id) {
        updatedLabelsList.push({
          labelId: clickedLabel.id,
          type: LabelFilterType.VALUE,
          valueId: -1,
          labelObj: clickedLabel,
          valueObj: {
            id: -1,
            color: clickedLabel.value_color,
            label_id: clickedLabel.id,
            value: getString('labels.anyValueOption')
          }
        })
      } else {
        updatedLabelsList.push({
          labelId: clickedLabel.id,
          type: LabelFilterType.LABEL,
          valueId: undefined,
          labelObj: clickedLabel,
          valueObj: undefined
        })
      }
      setLabelFilter(updatedLabelsList)
    }

    // if 'any value' label present - replace :
    const replacedAnyValueIfPresent = updatedLabelsList.map(filterObj => {
      if (
        filterObj.valueId === -1 &&
        filterObj.labelId === clickedLabel.id &&
        clickedLabel.value_id &&
        clickedLabel.value
      ) {
        return {
          ...filterObj,
          valueId: clickedLabel.value_id,
          valueObj: {
            id: clickedLabel.value_id,
            color: clickedLabel.value_color,
            label_id: clickedLabel.id,
            value: clickedLabel.value
          }
        }
      }
      return filterObj
    })
    const isUpdated = !updatedLabelsList.every((obj, index) => obj === replacedAnyValueIfPresent[index])
    if (isUpdated) {
      setLabelFilter(replacedAnyValueIfPresent)
    }
  }

  const columns: Column<TypesPullReqRepo>[] = useMemo(
    () => [
      {
        id: 'title',
        width: '100%',
        Cell: ({ row }: CellProps<TypesPullReqRepo>) => {
          //add type
          const { pull_request, repository } = row.original
          return (
            <Link
              className={css.rowLink}
              to={routes.toCODEPullRequest({
                repoPath: row?.original?.repository?.path as string,
                pullRequestId: String(pull_request?.number)
              })}>
              <Layout.Horizontal className={css.titleRow} spacing="medium">
                <PullRequestStateLabel iconSize={22} data={pull_request} iconOnly />
                <Container padding={{ left: 'small' }}>
                  <Layout.Vertical spacing="small">
                    <Container>
                      <Layout.Horizontal flex={{ alignItems: 'center' }} className={css.prLabels}>
                        <Layout.Horizontal spacing={'xsmall'}>
                          <Text
                            icon="code-repo"
                            font={{ variation: FontVariation.SMALL_SEMI }}
                            color={Color.GREY_600}
                            border={{ right: true }}
                            padding={{ right: 'small' }}>
                            {repository?.identifier}
                          </Text>
                          <Text padding={{ left: 'xsmall' }} color={Color.GREY_800} className={css.title} lineClamp={1}>
                            {pull_request?.title}
                          </Text>

                          <Container className={css.convo}>
                            <Icon
                              className={css.convoIcon}
                              padding={{ left: 'small', right: 'small' }}
                              name="code-chat"
                              size={15}
                            />
                            <Text font={{ variation: FontVariation.SMALL }} color={Color.GREY_500} tag="span">
                              {pull_request?.stats?.conversations}
                            </Text>
                          </Container>
                        </Layout.Horizontal>
                        <Render when={row.original && pull_request?.labels && pull_request.labels.length !== 0}>
                          {row.original?.pull_request?.labels?.map((label, index: number) => (
                            <Label
                              key={index}
                              name={label.key as string}
                              label_color={label.color as ColorName}
                              label_value={{
                                name: label.value as string,
                                color: label.value_color as ColorName
                              }}
                              scope={label.scope}
                              onClick={() => {
                                handleLabelClick(labelFilter, label)
                              }}
                            />
                          ))}
                        </Render>
                      </Layout.Horizontal>
                    </Container>
                    <Container>
                      <Layout.Horizontal spacing="small" style={{ alignItems: 'center' }}>
                        <Text color={Color.GREY_500} font={{ size: 'small' }}>
                          <StringSubstitute
                            str={getString('pr.statusLine')}
                            vars={{
                              state: pull_request?.state,
                              number: <Text inline>{pull_request?.number}</Text>,
                              time: (
                                <strong>
                                  <TimePopoverWithLocal
                                    time={defaultTo(
                                      (pull_request?.state == PullRequestState.MERGED
                                        ? pull_request?.merged
                                        : pull_request?.created) as number,
                                      0
                                    )}
                                    inline={false}
                                    font={{ variation: FontVariation.SMALL_BOLD }}
                                    color={Color.GREY_500}
                                    tag="span"
                                  />
                                </strong>
                              ),
                              user: (
                                <strong>
                                  {pull_request?.author?.display_name || pull_request?.author?.email || ''}
                                </strong>
                              )
                            }}
                          />
                        </Text>
                        <PipeSeparator height={10} />
                        <Container>
                          <Layout.Horizontal
                            spacing="xsmall"
                            style={{ alignItems: 'center' }}
                            onClick={Utils.stopEvent}>
                            <GitRefLink
                              text={pull_request?.target_branch as string}
                              url={routes.toCODERepository({
                                repoPath: repository?.path as string,
                                gitRef: pull_request?.target_branch
                              })}
                              showCopy={false}
                            />
                            <Text color={Color.GREY_500}>←</Text>
                            <GitRefLink
                              text={pull_request?.source_branch as string}
                              url={routes.toCODERepository({
                                repoPath: repository?.path as string,
                                gitRef: pull_request?.source_branch
                              })}
                              showCopy={false}
                            />
                          </Layout.Horizontal>
                        </Container>
                        <PipeSeparator height={10} />
                        <Icon name="execution-waiting" size={16} />
                        <Text color={Color.GREY_500} font={{ size: 'small' }}>
                          <StringSubstitute
                            str={getString('pr.updatedLine')}
                            vars={{
                              time: (
                                <strong>
                                  <TimePopoverWithLocal
                                    time={defaultTo(pull_request?.updated as number, 0)}
                                    inline={false}
                                    font={{ variation: FontVariation.SMALL_BOLD }}
                                    color={Color.GREY_500}
                                    tag="span"
                                  />
                                </strong>
                              )
                            }}
                          />
                        </Text>
                      </Layout.Horizontal>
                    </Container>
                  </Layout.Vertical>
                </Container>
                <FlexExpander />
              </Layout.Horizontal>
            </Link>
          )
        }
      }
    ],
    [getString] // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Container className={css.main}>
      <PageBody error={getErrorMessage(prError)} retryOnError={voidFn(refetchPrs)}>
        <LoadingSpinner visible={prLoading && !searchTerm} withBorder={!searchTerm} />

        <Render when={data}>
          <Layout.Vertical>
            <SpacePullRequestsContentHeader
              activeTab={activeTab}
              loading={prLoading && searchTerm !== undefined}
              activePullRequestFilterOption={filter}
              activePullRequestReviewFilterOption={reviewFilter}
              onPullRequestFilterChanged={_filter => {
                setFilter(_filter)
                setPage(1)
              }}
              onPullRequestReviewFilterChanged={_reviewFilter => {
                setReviewFilter(_reviewFilter)
                setPage(1)
              }}
              onSearchTermChanged={value => {
                setSearchTerm(value)
                setPage(1)
              }}
              activePullRequestAuthorObj={principal}
              activePullRequestAuthorFilterOption={authorFilter}
              activePullRequestLabelFilterOption={labelFilter}
              activePullRequestIncludeSubSpaceOption={includeSubspaces}
              onPullRequestAuthorFilterChanged={_authorFilter => {
                setAuthorFilter(_authorFilter)
                setPage(1)
              }}
              onPullRequestLabelFilterChanged={_labelFilter => {
                setLabelFilter(_labelFilter)
                setPage(1)
              }}
              onPullRequestIncludeSubSpaceOptionChanged={_includeSubspaces => {
                setIncludeSubspaces(_includeSubspaces as ScopeLevelEnum)
                setPage(1)
              }}
            />
            <Container padding="xlarge">
              <Container padding={{ top: 'medium', bottom: 'large' }}>
                <Layout.Horizontal
                  flex={{ alignItems: 'center', justifyContent: 'flex-start' }}
                  style={{ flexWrap: 'wrap', gap: '5px' }}>
                  <Render when={!isEmpty(labelFilter) || !prLoading}>
                    <Text color={Color.GREY_400}>
                      {isEmpty(data)
                        ? !isEmpty(labelFilter) && getString('labels.noResults')
                        : (stringSubstitute(getString('labels.prCount'), {
                            count: data?.length
                          }) as string)}
                    </Text>
                  </Render>

                  {labelFilter &&
                    labelFilter?.length !== 0 &&
                    labelFilter?.map((label, index) => (
                      <Label
                        key={index}
                        name={label.labelObj.key as string}
                        label_color={label.labelObj.color as ColorName}
                        label_value={{
                          name: label.valueObj?.value as string,
                          color: label.valueObj?.color as ColorName
                        }}
                        scope={label.labelObj.scope}
                        removeLabelBtn={true}
                        handleRemoveClick={() => {
                          if (label.type === 'value') {
                            const updateFilterObjArr = labelFilter.filter(filterObj => {
                              if (!(filterObj.labelId === label.labelId && filterObj.type === 'value')) {
                                return filterObj
                              }
                            })
                            setLabelFilter(updateFilterObjArr)
                            setPage(1)
                          } else if (label.type === 'label') {
                            const updateFilterObjArr = labelFilter.filter(filterObj => {
                              if (!(filterObj.labelId === label.labelId && filterObj.type === 'label')) {
                                return filterObj
                              }
                            })
                            setLabelFilter(updateFilterObjArr)
                            setPage(1)
                          }
                        }}
                        disableRemoveBtnTooltip={true}
                      />
                    ))}
                </Layout.Horizontal>
              </Container>
              <Match expr={data?.length && !prLoading}>
                <Truthy>
                  <>
                    <TableV2<any> //add type
                      className={css.table}
                      hideHeaders
                      columns={columns}
                      data={data || []}
                      getRowClassName={() => css.row}
                      onRowClick={noop}
                    />
                    <PrevNextPagination
                      onPrev={
                        page > 1 && data
                          ? () => {
                              setPage(pre => pre - 1)
                              setPageAction({ action: PageAction.PREV, timestamp: data[0].pull_request?.updated ?? 0 })
                            }
                          : false
                      }
                      onNext={
                        data && data?.length === LIST_FETCHING_LIMIT
                          ? () => {
                              setPage(pre => pre + 1)
                              setPageAction({
                                action: PageAction.NEXT,
                                timestamp: data.slice(-1)[0]?.pull_request?.updated ?? 0
                              })
                            }
                          : false
                      }
                    />
                  </>
                </Truthy>
                <Case val={0}>
                  <NoResultCard
                    forSearch={!!searchTerm}
                    forFilter={!isEmpty(labelFilter) || !isEmpty(authorFilter) || !isEmpty(filter)}
                    emptyFilterMessage={getString('pullRequestNotFoundforFilter')}
                    message={getString('pullRequestEmpty')}
                    buttonText={getString('newPullRequest')}
                  />
                </Case>
              </Match>
            </Container>
          </Layout.Vertical>
        </Render>
      </PageBody>
    </Container>
  )
}
