/**
 * The tests are written against the shop Flöda was built in: the snow-and-outdoor menu and its
 * marker. A fresh install runs blank until setup; the tests put those conventions in force first.
 */
import { SNOW_TEST_CONVENTIONS, activateConventions } from "./lib/catalog/taxonomy";

activateConventions(SNOW_TEST_CONVENTIONS);
