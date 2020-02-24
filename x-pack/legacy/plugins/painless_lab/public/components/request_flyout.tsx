/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';
import {
  EuiCodeBlock,
  EuiTabbedContent,
  EuiTitle,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export function RequestFlyout({
  onClose,
  requestBody,
  response,
}: {
  onClose: any;
  requestBody: string;
  response?: string;
}) {
  return (
    <EuiFlyout onClose={onClose} maxWidth={640}>
      <EuiFlyoutHeader>
        <EuiFlexGroup gutterSize="xs">
          <EuiFlexItem>
            {/* We need an extra div to get out of flex grow */}
            <div>
              <EuiTitle size="m">
                <h2>
                  {i18n.translate('xpack.painlessLab.flyoutTitle', {
                    defaultMessage: 'API request',
                  })}
                </h2>
              </EuiTitle>
            </div>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              flush="right"
              href="https://www.elastic.co/guide/en/elasticsearch/painless/current/painless-execute-api.html"
              target="_blank"
              iconType="help"
            >
              {i18n.translate('xpack.painlessLab.flyoutDocLink', {
                defaultMessage: 'API documentation',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiTabbedContent
          size="s"
          tabs={[
            {
              id: 'request',
              name: 'Request',
              content: (
                <EuiCodeBlock language="json" paddingSize="s" isCopyable>
                  {'POST _scripts/painless/_execute\n'}
                  {requestBody}
                </EuiCodeBlock>
              ),
            },
            {
              id: 'response',
              name: 'Response',
              content: (
                <EuiCodeBlock language="json" paddingSize="s" isCopyable>
                  {response}
                </EuiCodeBlock>
              ),
            },
          ]}
        />

        <div className="painlessLabBottomBarPlaceholder" />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
}
