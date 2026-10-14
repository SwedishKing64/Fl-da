/**
 * The tests are written against the shop Flöda was built in: the snow-and-outdoor menu and its
 * marker. A fresh install runs blank until setup; the tests put those conventions in force first.
 */
import { ALPSPORT_CONVENTIONS, activateConventions } from "./lib/catalog/taxonomy";

activateConventions(ALPSPORT_CONVENTIONS);
