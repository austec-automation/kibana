/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import expect from '@kbn/expect';
import { getCategoryName } from '../get_category_name';

describe('Settings', function () {
  describe('Advanced', function () {
    describe('getCategoryName(category)', function () {
      it('should be a function', function () {
        expect(getCategoryName).to.be.a(Function);
      });

      it('should return correct name for known categories', function () {
        expect(getCategoryName('general')).to.be('General');
        expect(getCategoryName('timelion')).to.be('Timelion');
        expect(getCategoryName('notifications')).to.be('Notifications');
        expect(getCategoryName('visualizations')).to.be('Visualizations');
        expect(getCategoryName('discover')).to.be('Discover');
        expect(getCategoryName('dashboard')).to.be('Dashboard');
        expect(getCategoryName('reporting')).to.be('Reporting');
        expect(getCategoryName('search')).to.be('Search');
      });

      it('should capitalize unknown category', function () {
        expect(getCategoryName('elasticsearch')).to.be('Elasticsearch');
      });

      it('should return empty string for no category', function () {
        expect(getCategoryName()).to.be('');
        expect(getCategoryName('')).to.be('');
        expect(getCategoryName(false)).to.be('');
      });
    });
  });
});
